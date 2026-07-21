import { generateAIContent } from './aiProvider';
import { AGENT_SYSTEM_PROMPTS } from './agentPrompts';
import { buildContextString } from './contextBuilder';
import { validateAIResponse, createResponseSchema, buildRetryFeedback, SECTION_CONCEPT_GROUPS } from './validationLayer';
import { SECTION_TITLES } from '../../config/blueprintSections';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { AGENT_ROLES } from '../../config/sectionOwnership';
import { useSettingsStore } from '../../store/useSettingsStore';

// Sections each agent is responsible for generating (single source of truth).
const AGENT_RESPONSIBILITIES = AGENT_ROLES;

// Build a minimal, token-efficient prompt for small models like Qwen2.5-0.5B.
// The full context builder outputs 600-1000+ tokens of input which leaves 0 capacity for output.
const buildWebLLMPrompt = (sectionKey, sectionTitle, expectedConcepts) => {
  const project = useProjectStore.getState().project;
  const name = project?.name || 'the startup';
  const idea = project?.idea || 'a software product';
  const budget = project?.budget || 'unspecified';
  const audience = project?.targetAudience || 'general users';

  return `Project: ${name}
Description: ${idea}
Budget: ${budget}
Audience: ${audience}

Write the "${sectionTitle}" section for a startup blueprint.
Include these concepts: ${expectedConcepts || 'relevant business details'}.
Write 2-4 sentences of concrete, specific content about this startup.

Respond ONLY with valid JSON. Example: {"${sectionKey}": "your content here"}
The value MUST NOT be empty or null.`;
};

// Generate simple valid Mermaid diagrams from project data (for WebLLM which can't do Mermaid)
const generateTemplateDiagram = (sectionKey) => {
  const project = useProjectStore.getState().project;
  const name = (project?.name || 'App').replace(/[^a-zA-Z0-9 ]/g, '');

  if (sectionKey === 'umlDiagram') {
    return `\`\`\`mermaid
usecaseDiagram
  actor User
  actor Admin
  User --> (Register / Login)
  User --> (Browse Listings)
  User --> (Place Order)
  User --> (Track Order)
  Admin --> (Manage Listings)
  Admin --> (View Analytics)
\`\`\``;
  }

  if (sectionKey === 'erDiagram') {
    return `\`\`\`mermaid
erDiagram
  USER {
    int id PK
    string name
    string email
    string role
  }
  ORDER {
    int id PK
    int userId FK
    string status
    float totalAmount
    datetime createdAt
  }
  ITEM {
    int id PK
    int orderId FK
    string name
    int quantity
    float price
  }
  USER ||--o{ ORDER : places
  ORDER ||--|{ ITEM : contains
\`\`\``;
  }

  if (sectionKey === 'architecture') {
    return `\`\`\`mermaid
graph TD
  Client["Client (Web / Mobile)"]
  API["API Gateway"]
  Auth["Auth Service"]
  Core["Core Service"]
  DB[("PostgreSQL")]
  Cache[("Redis Cache")]
  Client --> API
  API --> Auth
  API --> Core
  Core --> DB
  Core --> Cache
\`\`\``;
  }

  return null;
};

const SECTION_MAX_TOKENS = {
  executiveSummary: 400,
  targetUsers: 300,
  businessModel: 400,
  budgetCostEstimate: 300,
  risksMitigation: 350,
  problemStatement: 300,
  proposedSolution: 400,
  mvpScope: 300,
  keyFeatures: 400,
  productRoadmap: 350,
  timeline: 250,
  architecture: 500,
  technologyStack: 400,
  umlDiagram: 500,
  erDiagram: 500,
  marketingStrategy: 400,
  finalRecommendations: 300,
  agentContributions: 600
};

export const generateAgentContent = async (agentRole, instruction = '') => {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentRole];
  if (!systemPrompt) throw new Error(`Unknown agent role: ${agentRole}`);

  const memoryStore = useProjectMemoryStore.getState();
  const domain = memoryStore.memory?.scope?.domain || useProjectStore.getState().project?.domain || '';
  const industry = memoryStore.memory?.scope?.industry || '';
  const keywordsStr = memoryStore.memory?.scope?.mandatory_entities || '';
  const mandatoryKeywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);

  const { setSource, pushLog } = useAIDebugStore.getState();
  const sectionsToGenerate = AGENT_RESPONSIBILITIES[agentRole] || [];

  // Detect provider once per agent (not per section)
  const globalProvider = useSettingsStore.getState().aiProvider;
  const projectProvider = useProjectStore.getState().project?.aiProvider;
  const providerName = projectProvider || globalProvider || 'webllm';
  const isWebLLM = providerName !== 'gemini';

  let mergedContent = {};
  let allDecisions = [];
  let mergedScores = { structural: 100, agentRelevance: 100, domainRelevance: 100, overall: 100 };
  let mergedStages = {
    structural: { status: 'passed', score: 100 },
    agentRelevance: { status: 'passed', score: 100 },
    domainRelevance: { status: 'passed', score: 100 }
  };
  let actualProvider = 'Unknown';

  for (const sectionKey of sectionsToGenerate) {
    const singleSectionSchema = createResponseSchema([sectionKey]);
    const maxAttempts = 2;

    let retryFeedback = null;
    let previousRawResponse = null;
    let sectionPassed = false;
    let lastError = null;
    let bestAttempt = null;
    let bestScore = -1;

    const sectionTitle = SECTION_TITLES[sectionKey] || sectionKey;
    const expectedConcepts = (SECTION_CONCEPT_GROUPS[sectionKey] || []).map(g => g[0]).join(', ');
    const isDiagram = ['architecture', 'umlDiagram', 'erDiagram'].includes(sectionKey);
    let lengthInstruction = 'Write 80 to 150 words.';
    if (['finalRecommendations', 'timeline', 'mvpScope'].includes(sectionKey)) {
      lengthInstruction = 'Write 1 to 3 short sentences.';
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let rawResponse = null;
      let usedProvider = null;
      let fallbackReason = null;
      let validation = null;

      try {
        let userPrompt;
        if (isWebLLM) {
          // For diagram sections, use a template instead of asking the tiny model
          if (isDiagram) {
            const diagram = generateTemplateDiagram(sectionKey);
            if (diagram) {
              mergedContent[sectionKey] = diagram;
              setSource(agentRole, 'WebLLM (Template)');
              sectionPassed = true;
              console.log(`[AI Factory] Using template diagram for ${sectionKey}`);
              break;
            }
          }
          // Minimal prompt: keeps input tokens low so the 0.5B model has room to write output
          const base = buildWebLLMPrompt(sectionKey, sectionTitle, expectedConcepts);
          if (retryFeedback) {
            userPrompt = `${base}\n\nPrevious attempt was wrong. Fix: ${retryFeedback}\nRespond ONLY with valid JSON: {"${sectionKey}": "your content"}. Value MUST NOT be empty.`;
          } else {
            userPrompt = base;
          }
        } else {
          // Full rich context for Gemini
          let baseContext = buildContextString(instruction, agentRole);
          if (Object.keys(mergedContent).length > 0) {
            baseContext += `\n\nPreviously generated sections by you:\n\`\`\`json\n${JSON.stringify(mergedContent, null, 2)}\n\`\`\`\nEnsure consistency with what you have already written.`;
          }
          const formatInstruction = isDiagram
            ? 'This section REQUIRES a diagram. Include valid mermaid.js syntax wrapped in ```mermaid code fences.'
            : 'Do NOT include markdown code blocks or mermaid syntax. Provide concrete, business-oriented text.';

          const basePrompt = `${baseContext}

Task: Generate ONLY the blueprint section: "${sectionTitle}" (${sectionKey}).

PURPOSE: This section belongs exclusively to the ${agentRole.toUpperCase()} agent.
EXPECTED CONCEPTS: You MUST explicitly include these concepts: ${expectedConcepts || 'project-specific details'}.
FORMAT: ${lengthInstruction} ${formatInstruction} Use concrete numbers and actionable specifics where appropriate.
OUTPUT: Respond with ONLY valid JSON containing exactly the property "${sectionKey}". The value MUST NOT BE EMPTY. Do NOT output any text outside the JSON object.`;

          userPrompt = retryFeedback
            ? `${basePrompt}\n\n--- PREVIOUS RAW RESPONSE ---\n${previousRawResponse}\n\n--- EXACT VALIDATION FEEDBACK ---\n${retryFeedback}`
            : basePrompt;
        }

        const maxTokens = SECTION_MAX_TOKENS[sectionKey] || 400;
        const aiResult = await generateAIContent(systemPrompt, userPrompt, singleSectionSchema, maxTokens);
        rawResponse = aiResult.responseText;
        usedProvider = aiResult.providerName;
        actualProvider = usedProvider;

        // Validate just this section
        const parseStart = performance.now();
        validation = validateAIResponse(rawResponse, [sectionKey], { agentRole, domain, industry, mandatoryKeywords });
        const parseEnd = performance.now();
        console.log(`[Diagnostic] Time spent inside JSON parsing: ${Math.round(parseEnd - parseStart)}ms`);

        console.log(`\n--------------------------------`);
        console.log(`Provider: ${actualProvider}`);
        console.log(`Agent: ${agentRole.toUpperCase()}`);
        console.log(`Section: ${sectionKey}`);
        console.log(`JSON parsing time: ${Math.round(parseEnd - parseStart)}ms`);
        console.log(`Validation result: ${validation.passed ? 'PASSED' : 'FAILED'}`);
        console.log(`Fallback used: ${validation.passed ? 'NO' : 'YES'}`);
        console.log(`--------------------------------\n`);

        if (validation.scores.overall > bestScore && validation.content[sectionKey]) {
          bestScore = validation.scores.overall;
          bestAttempt = {
            content: validation.content,
            decisions: validation.decisions,
            scores: validation.scores,
            issues: validation.issues
          };
        }

        if (validation.passed) {
          console.log(`[Trace] ${agentRole.toUpperCase()} - ${sectionKey} - Validation passed: true`);
          pushLog({ agent: agentRole, prompt: userPrompt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'PASSED', fallbackReason: null });
          setSource(agentRole, usedProvider);

          mergedContent[sectionKey] = validation.content[sectionKey];
          allDecisions.push(...validation.decisions);
          mergedScores.overall = Math.round((mergedScores.overall + validation.scores.overall) / 2);

          sectionPassed = true;
          break;
        }

        fallbackReason = `Validation failed for ${sectionKey} (overall ${validation.scores.overall}%): ${validation.issues.join(' ')}`;
        console.log(`[Trace] ${agentRole.toUpperCase()} - ${sectionKey} - Validation passed: false`);
        pushLog({ agent: agentRole, prompt: userPrompt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'FAILED', fallbackReason });
        retryFeedback = buildRetryFeedback(validation);
        previousRawResponse = rawResponse;
      } catch (err) {
        fallbackReason = err.message || 'Unknown error';
        pushLog({ agent: agentRole, prompt: (retryFeedback ? 'RETRY' : 'INITIAL').slice(0, 400), rawResponse: rawResponse?.slice(0, 800) || null, parsedJson: null, scores: null, validationResult: 'FAILED', fallbackReason });
      }

      console.warn(`[AI Factory] Attempt ${attempt} failed for ${agentRole} (${sectionKey}): ${fallbackReason}`);
      lastError = fallbackReason;
    }

    if (!sectionPassed) {
      if (bestAttempt && bestAttempt.content[sectionKey]) {
        console.warn(`[AI Factory] Accepting best attempt for ${agentRole} (${sectionKey}) despite validation failures.`);
        setSource(agentRole, `${actualProvider} (With Warnings)`);

        mergedContent[sectionKey] = bestAttempt.content[sectionKey] + `\n\n> ⚠️ **Validation Warning:** ${bestAttempt.issues.join(' ')}`;
        allDecisions.push(...bestAttempt.decisions);
        mergedScores.overall = Math.round((mergedScores.overall + bestAttempt.scores.overall) / 2);
      } else {
        console.warn(`[AI Factory] Could not generate ANY valid JSON for ${agentRole} (${sectionKey}). Throwing error.`);
        setSource(agentRole, 'Failed');
        if (import.meta.env.DEV) {
          throw new Error(`[DEV FATAL] Failed to generate ${sectionKey}. Last error: ${lastError}. Raw output: ${previousRawResponse}`);
        } else {
          throw new Error(`Generation failed for ${SECTION_TITLES[sectionKey] || sectionKey}. Please try again.`);
        }
      }
    }
  }

  return {
    content: mergedContent,
    decisions: allDecisions,
    scores: mergedScores,
    stages: mergedStages,
    generationSource: actualProvider,
    generatedBy: agentRole,
    generatedAt: new Date().toISOString()
  };
};
