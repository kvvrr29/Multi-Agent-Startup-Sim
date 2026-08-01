import { generateAIContent } from './aiProvider';
import { getActiveProviderName, getProviderSourceLabel } from './activeProvider';
import { getProviderProfile, getSectionMaxTokens, getMaxContextTokens, DIAGRAM_SECTIONS } from './providerProfiles';
import { AGENT_SYSTEM_PROMPTS, withJsonHardening, SPECIFICITY_DIRECTIVE, NO_MERMAID_DIRECTIVE } from './agentPrompts';
import { buildContextString } from './contextBuilder';
import { validateAIResponse, createResponseSchema, buildRetryFeedback, SECTION_CONCEPT_GROUPS } from './validationLayer';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { AGENT_SECTIONS } from '../../config/sectionOwnership';
import { SECTION_TITLES } from '../../../shared/blueprintSections.js';

const MAX_ATTEMPTS = 2;

/**
 * Both strategies share this and get the identical brief, differing only in how
 * many sections are asked for and how explicitly. `profile.minWords` is what
 * fixes short output — nothing else in the chain states a length.
 */
const buildUserPrompt = (sectionKeys, instruction, agentRole, profile, sectionMaxTokens = null, { brevity = false } = {}) => {
  const perSection = profile.strategy === 'perSection';
  // The local model differs only in carrying a budget, which trims the
  // blueprint state if — and only if — the context would not fit its window.
  const context = buildContextString(instruction, agentRole, {
    focusSections: sectionKeys,
    maxContextTokens: getMaxContextTokens(profile, sectionMaxTokens)
  });

  let task = `\n\nTask: Based on the context above, generate the following blueprint sections in detailed Markdown format: ${sectionKeys.join(', ')}.`;
  if (instruction) {
    // A revision has to say so in the task. Left to the context alone the
    // instruction sits thousands of tokens up and the task still reads as a
    // fresh write — so the model produces one, discarding the existing text.
    task += ` Rewrite each one so it applies this instruction to its current text shown above: ${instruction}. Keep whatever the instruction does not ask you to change.`;
  }
  task += ` ${SPECIFICITY_DIRECTIVE} ${NO_MERMAID_DIRECTIVE} Respond with JSON matching the requested schema.`;

  if (perSection) {
    // A small model needs the shape spelled out; the schema alone is advisory
    // for it in a way it is not for a cloud API that enforces one. The concept
    // list comes from the groups the relevance validator scores against, so a
    // local relevance score reads as "covered what it was told to cover"
    // rather than as an independent judgement. Cloud gets no such hint.
    const concepts = sectionKeys
      .flatMap(key => (SECTION_CONCEPT_GROUPS[key] || []).map(group => group[0]))
      .slice(0, 6).join(', ');
    const titles = sectionKeys.map(key => SECTION_TITLES[key] || key).join(', ');
    task = `\n\nTask: Write the "${titles}" section for this startup, in detailed Markdown.`;
    if (concepts) task += `\nCover concepts such as: ${concepts}.`;
    if (instruction) {
      task += `\nApply this instruction to the current text shown above: ${instruction}`;
    }
    task += `\n\nRequirements:`;
    // The length target is stated once, here. A truncated attempt needs the
    // opposite target, so it replaces this line rather than contradicting it
    // later in the prompt — a small model given both writes neither.
    task += brevity
      ? `\n- The previous attempt ran past the length limit and was cut off. Write 2 to 3 compact paragraphs and make sure the JSON object is closed.`
      : `\n- Write at least ${profile.minWords} words, as ${profile.minParagraphs} or more full paragraphs.`;
    task += `\n- ${SPECIFICITY_DIRECTIVE} Do not write filler or restate the task.`;
    task += `\n- ${NO_MERMAID_DIRECTIVE}`;
    task += `\n- Respond with ONLY valid JSON in this exact shape: {${sectionKeys.map(k => `"${k}": "..."`).join(', ')}}`;
    task += `\n- Put the markdown prose inside the JSON string value. Output no text outside the JSON object.`;
  }

  return `${context}${task}`;
};

// Hand-written mermaid skeletons. A small local model reliably emits mermaid
// that fails to render, breaking the whole blueprint view — a correct generic
// diagram beats a malformed bespoke one.
const TEMPLATE_DIAGRAMS = {
  architecture: '```mermaid\ngraph TD\n  Client[Client App] --> Gateway[API Gateway]\n  Gateway --> Service[Application Service]\n  Service --> DB[(Database)]\n  Service --> Cache[(Cache)]\n```',
  umlDiagram: '```mermaid\ngraph TD\n  User((User)) --> Login[Sign In]\n  User --> Browse[Browse Catalogue]\n  User --> Manage[Manage Account]\n  Admin((Admin)) --> Reports[View Reports]\n```',
  erDiagram: '```mermaid\nerDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains\n  USER {\n    int id\n    string name\n  }\n  ORDER {\n    int id\n    date created_at\n  }\n```'
};

const buildTemplateDiagram = (sectionKey, sectionTitle) => {
  const diagram = TEMPLATE_DIAGRAMS[sectionKey];
  if (!diagram) return null;
  return `### ${sectionTitle}\n\nA baseline structure for this project, generated locally as a starting point to refine.\n\n${diagram}`;
};

/**
 * Which sections this call writes: everything the agent owns, or just the set a
 * revision routed — regenerating the rest costs a whole extra call each.
 * Intersected with ownership rather than trusted, since the router's output
 * reaches here and an agent must never write a section it does not own.
 */
const resolveSections = (agentRole, targetSections) => {
  const owned = AGENT_SECTIONS[agentRole] || [];
  if (!targetSections?.length) return owned;

  const requested = owned.filter(key => targetSections.includes(key));
  if (requested.length === 0) {
    // normalizeRouting already drops tasks failing this same ownership check,
    // so an empty result means a hand-built task got it wrong. Falling back to
    // `owned` would silently reinstate the over-generation this prevents.
    throw new Error(
      `No section owned by ${agentRole} in the requested set: ${targetSections.join(', ')}.`
    );
  }
  return requested;
};

const readScope = () => {
  const memoryStore = useProjectMemoryStore.getState();
  const keywordsStr = memoryStore.memory?.scope?.mandatory_entities || '';
  return {
    domain: memoryStore.memory?.scope?.domain || '',
    industry: memoryStore.memory?.scope?.industry || '',
    mandatoryKeywords: keywordsStr.split(',').map(k => k.trim()).filter(k => k)
  };
};

const buildResult = (content, decisions, scores, stages, source, agentRole) => ({
  content,
  decisions,
  scores,
  stages,
  generationSource: source,
  generatedBy: agentRole,
  generatedAt: new Date().toISOString()
});

// Single call covering every section the agent owns, with one feedback-driven
// retry. The path for cloud models.
const generateBatch = async (agentRole, instruction, systemPrompt, profile, providerName, sourceLabel, sectionsToGenerate) => {
  const schema = createResponseSchema(sectionsToGenerate, { dialect: profile.schemaDialect });
  const userPrompt = buildUserPrompt(sectionsToGenerate, instruction, agentRole, profile);

  const { domain, industry, mandatoryKeywords } = readScope();
  const { setSource, pushLog } = useAIDebugStore.getState();
  let retryFeedback = null;
  let previousRawResponse = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let rawResponse = null;
    let fallbackReason = null;
    try {
      const promptForAttempt = retryFeedback
        ? `${userPrompt}\n\n--- PREVIOUS RAW RESPONSE ---\n${previousRawResponse}\n\n--- EXACT VALIDATION FEEDBACK ---\n${retryFeedback}`
        : userPrompt;

      rawResponse = await generateAIContent(systemPrompt, promptForAttempt, schema);
      const validation = validateAIResponse(rawResponse, sectionsToGenerate, { agentRole, domain, industry, mandatoryKeywords, providerName });

      if (validation.passed) {
        pushLog({ agent: agentRole, prompt: promptForAttempt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'PASSED', fallbackReason: null });
        setSource(agentRole, sourceLabel);
        return buildResult(validation.content, validation.decisions, validation.scores, validation.stages, sourceLabel, agentRole);
      }

      fallbackReason = `Validation failed (overall ${validation.scores.overall}%): ${validation.issues.join(' ')}`;
      pushLog({ agent: agentRole, prompt: promptForAttempt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'FAILED', fallbackReason });
      retryFeedback = buildRetryFeedback(validation);
      previousRawResponse = rawResponse;
    } catch (err) {
      // API/network error — retry without feedback (nothing to correct)
      fallbackReason = err.message || 'Unknown error';
      pushLog({ agent: agentRole, prompt: userPrompt.slice(0, 400), rawResponse: rawResponse?.slice(0, 800) || null, parsedJson: null, scores: null, validationResult: 'FAILED', fallbackReason });
    }

    console.warn(`[AI Factory] Attempt ${attempt} failed for ${agentRole}: ${fallbackReason}`);
    if (attempt >= MAX_ATTEMPTS) {
      setSource(agentRole, 'Fallback');
      throw new Error(fallbackReason);
    }
  }
};

/**
 * One call per section, each with its own token budget, because a small local
 * model cannot hold five sections plus full context in a single response. A
 * section that never validates keeps its best parseable attempt rather than
 * failing the whole agent; only a total washout throws.
 */
const generatePerSection = async (agentRole, instruction, systemPrompt, profile, providerName, sourceLabel, sectionsToGenerate) => {
  const { domain, industry, mandatoryKeywords } = readScope();
  const { setSource, pushLog } = useAIDebugStore.getState();

  const mergedContent = {};
  const mergedDecisions = [];
  const scoreSamples = [];
  const failedSections = [];

  for (const sectionKey of sectionsToGenerate) {
    const sectionTitle = SECTION_TITLES[sectionKey] || sectionKey;

    if (profile.templateDiagrams && DIAGRAM_SECTIONS.includes(sectionKey)) {
      const diagram = buildTemplateDiagram(sectionKey, sectionTitle);
      if (diagram) {
        mergedContent[sectionKey] = diagram;
        console.log(`[AI Factory] Using a template diagram for ${sectionKey}.`);
        continue;
      }
    }

    const schema = createResponseSchema([sectionKey], { dialect: profile.schemaDialect });
    const maxTokens = getSectionMaxTokens(sectionKey, profile);
    const basePrompt = buildUserPrompt([sectionKey], instruction, agentRole, profile, maxTokens);

    let sectionDone = false;
    let bestEffort = null;
    let lastReason = null;
    let wasTruncated = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sectionDone; attempt++) {
      let rawResponse = null;
      try {
        // A truncated attempt ran out of room rather than misunderstanding the
        // task, so the retry asks for brevity — which must replace the length
        // requirement inside the prompt, hence a rebuild not an appended hint.
        let prompt = basePrompt;
        if (attempt > 1) {
          prompt = wasTruncated
            ? buildUserPrompt([sectionKey], instruction, agentRole, profile, maxTokens, { brevity: true })
            : `${basePrompt}\n\nThe previous attempt was rejected: ${lastReason}\nReturn ONLY {"${sectionKey}": "your content"} with a non-empty value.`;
        }

        rawResponse = await generateAIContent(systemPrompt, prompt, schema, maxTokens);
        const validation = validateAIResponse(rawResponse, [sectionKey], { agentRole, domain, industry, mandatoryKeywords, providerName });

        if (validation.passed) {
          mergedContent[sectionKey] = validation.content[sectionKey];
          if (validation.decisions?.length) mergedDecisions.push(...validation.decisions);
          scoreSamples.push(validation.scores);
          pushLog({ agent: agentRole, prompt: prompt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'PASSED', fallbackReason: null });
          sectionDone = true;
          break;
        }

        wasTruncated = false;
        if (validation.content?.[sectionKey]) bestEffort = validation.content[sectionKey];
        lastReason = `Validation failed (overall ${validation.scores.overall}%): ${validation.issues.join(' ')}`;
        pushLog({ agent: agentRole, prompt: prompt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'FAILED', fallbackReason: lastReason });
      } catch (err) {
        wasTruncated = !!err.isTruncated;
        lastReason = err.message || 'Unknown error';
        pushLog({ agent: agentRole, prompt: basePrompt.slice(0, 400), rawResponse: rawResponse?.slice(0, 800) || err.partialText?.slice(0, 800) || null, parsedJson: null, scores: null, validationResult: 'FAILED', fallbackReason: lastReason });
      }
    }

    if (!sectionDone) {
      if (bestEffort) {
        // Thin but real content beats an empty section on a local model.
        mergedContent[sectionKey] = bestEffort;
        console.warn(`[AI Factory] ${sectionKey} kept as best-effort content: ${lastReason}`);
      } else {
        failedSections.push(sectionKey);
        console.warn(`[AI Factory] ${sectionKey} produced nothing usable: ${lastReason}`);
      }
    }
  }

  if (Object.keys(mergedContent).length === 0) {
    setSource(agentRole, 'Fallback');
    throw new Error(`No section could be generated for ${agentRole}. Last reason: ${failedSections.join(', ') || 'unknown'}`);
  }

  const average = (key) => scoreSamples.length
    ? Math.round(scoreSamples.reduce((sum, s) => sum + s[key], 0) / scoreSamples.length)
    : 0;
  const scores = {
    structural: average('structural'),
    agentRelevance: average('agentRelevance'),
    domainRelevance: average('domainRelevance'),
    overall: average('overall')
  };
  const stages = {
    structural: { status: failedSections.length === 0 ? 'passed' : 'failed', score: scores.structural, threshold: profile.thresholds.structural },
    agentRelevance: { status: 'passed', score: scores.agentRelevance, threshold: profile.thresholds.agentRelevance },
    domainRelevance: { status: 'passed', score: scores.domainRelevance, threshold: profile.thresholds.domainRelevance }
  };

  setSource(agentRole, sourceLabel);
  return buildResult(mergedContent, mergedDecisions, scores, stages, sourceLabel, agentRole);
};

/**
 * @param agentRole      which specialist writes this
 * @param instruction    revision instruction, or '' for initial generation
 * @param targetSections sections to write; omit to write everything the agent
 *                       owns. Revisions should always pass the routed set.
 */
export const generateAgentContent = async (agentRole, instruction = '', targetSections = null) => {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentRole];
  if (!systemPrompt) throw new Error(`Unknown agent role: ${agentRole}`);

  const providerName = getActiveProviderName();
  const profile = getProviderProfile(providerName);
  const sourceLabel = getProviderSourceLabel(providerName);
  const hardenedPrompt = withJsonHardening(systemPrompt, profile);
  const sections = resolveSections(agentRole, targetSections);

  return profile.strategy === 'perSection'
    ? generatePerSection(agentRole, instruction, hardenedPrompt, profile, providerName, sourceLabel, sections)
    : generateBatch(agentRole, instruction, hardenedPrompt, profile, providerName, sourceLabel, sections);
};
