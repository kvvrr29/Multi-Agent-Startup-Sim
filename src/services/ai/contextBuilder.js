import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { SECTION_OWNERSHIP } from '../../config/sectionOwnership';

// Which memory categories are relevant to each agent (doc §13: the Mediator
// injects only the relevant memory into each agent request; scope is global).
const AGENT_MEMORY_CATEGORIES = {
  ceo: ['scope', 'business'],
  pm: ['scope', 'product', 'business'],
  developer: ['scope', 'technical', 'product'],
  marketing: ['scope', 'marketing', 'business'],
  mediator: ['scope', 'business', 'product', 'technical', 'marketing']
};

// The same 4-chars-per-token heuristic the cost tracker uses. It only has to be
// good enough to decide whether the blueprint state needs trimming, and
// getMaxContextTokens leaves slack for it being wrong.
const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);

// How far non-focus sections get trimmed back when the context does not fit,
// tried in order. The first length that fits wins, so a blueprint only loses
// as much detail as the window actually demands.
const TRIM_STEPS = [1600, 800, 400, 240, 120];

/**
 * Builds the context block every agent request is grounded in.
 *
 * Both providers get the same context. The shape of the brief is a property of
 * the project, not of the model, and a local model given less than the cloud
 * one writes correspondingly less specific content.
 *
 * `focusSections` names the sections this call is actually producing. Their
 * current text is always included in full, because a revision instruction like
 * "make this longer" is meaningless without it.
 *
 * `maxContextTokens` is the one concession to a fixed window. Cloud passes
 * nothing and its context is unchanged, byte for byte. The local engine passes
 * its budget, and if the assembled brief exceeds it the sections this call is
 * *not* writing are trimmed — approved ones included — until it fits. Without
 * this the context is unbounded: approved sections are never truncated, so a
 * blueprint of seventeen approved 350-word sections builds an 11,700-token
 * brief and overflows an 8192 window outright.
 *
 * `compact` is the older, blunter answer to the same problem: drop non-focus
 * sections and the memory blocks entirely rather than trim them. Nothing uses
 * it now that the budget exists, but it is kept as the fallback if full context
 * proves too slow to prefill on modest hardware.
 */
export const buildContextString = (
  customInstruction = '',
  agentRole = 'mediator',
  { compact = false, focusSections = null, maxContextTokens = null } = {}
) => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();

  const { project, blueprint } = store;
  const memory = memoryStore.memory;
  const current = (category, key, original, fallback = 'Unknown') =>
    memory?.[category]?.[key] ?? original ?? fallback;
  const focus = focusSections?.length ? new Set(focusSections) : null;

  let context = `--- STARTUP CONTEXT ---\n`;
  context += `Project Name: ${project?.name || 'Unknown'}\n`;
  context += `Project Description (PRIMARY SOURCE OF TRUTH — weigh this above the project name): ${project?.idea || 'Unknown'}\n`;
  context += `Domain: ${current('scope', 'domain')}\n`;
  context += `Industry: ${current('scope', 'industry')}\n`;
  // Every scope field is kept in compact mode: together they cost ~40 tokens,
  // and they are exactly the constraints that stop output being generic. A
  // roadmap written without knowing "6 months, 4 people" is filler.
  context += `Project Type: ${current('scope', 'project_type')}\n`;
  context += `Business Model: ${current('scope', 'business_model')}\n`;
  context += `Budget: ${current('scope', 'budget', project?.budget)}\n`;
  context += `Target Audience: ${current('business', 'targetAudience', project?.targetAudience)}\n`;
  context += `Platform Preference: ${current('scope', 'platforms', project?.platform, 'Not specified')}\n`;
  context += `Timeline: ${current('scope', 'timeline', project?.timeline, 'Not specified')}\n`;
  context += `Team Size: ${current('scope', 'teamSize', project?.teamSize, 'Not specified')}\n`;
  context += `Project Priorities: ${current('scope', 'priorities', project?.priorities, 'Not specified')}\n\n`;

  // Only the memory categories relevant to this agent (doc §13)
  const relevantCategories = AGENT_MEMORY_CATEGORIES[agentRole] || AGENT_MEMORY_CATEGORIES.mediator;

  const relevantDecisionHistory = (memoryStore.decisionHistory || [])
    .filter(decision => relevantCategories.includes(String(decision.category || '').toLowerCase()))
    .slice(-12);

  if (!compact) {
    const relevantMemory = {};
    relevantCategories.forEach(cat => {
      const entries = memory?.[cat];
      if (entries && typeof entries === 'object' && Object.keys(entries).length > 0) {
        relevantMemory[cat] = entries;
      }
    });

    context += `--- PROJECT MEMORY (Decisions Made — relevant to your role) ---\n`;
    context += JSON.stringify(relevantMemory, null, 2) + `\n\n`;

    if (relevantDecisionHistory.length) {
      context += `--- RELEVANT REVISION DECISIONS (append-only log) ---\n`;
      context += JSON.stringify(relevantDecisionHistory, null, 2) + `\n\n`;
    }

    const recentRevisions = (store.workflowEvents || []).filter(event => event.type === 'revision').slice(-5);
    if (recentRevisions.length) {
      context += `--- RECENT REVISION SUMMARIES ---\n`;
      context += recentRevisions.map(event => `- ${event.message}`).join('\n') + `\n\n`;
    }
  } else if (relevantDecisionHistory.length) {
    // The same decisions the full context carries as raw JSON, one line each.
    // Dropping these entirely was a correctness bug, not a size saving: without
    // them a revision happily contradicts what an earlier revision settled.
    context += `--- DECISIONS ALREADY SETTLED (do not contradict these) ---\n`;
    context += relevantDecisionHistory
      .map(d => `- ${d.key}: ${d.value}${d.rationale ? ` (${d.rationale})` : ''}`)
      .join('\n') + `\n\n`;
  }

  // `trimTo` is the ceiling for sections this call is not writing. null means
  // the original rule: approved sections in full, the rest cut at 240 chars.
  const renderBlueprintState = (trimTo = null) => {
    let state = '';
    Object.keys(blueprint).forEach(key => {
      const section = blueprint[key];
      if (!section || !section.content) return;
      const isFocus = focus ? focus.has(key) : SECTION_OWNERSHIP[key] === agentRole;
      // In compact mode everything outside the focus set is dropped rather than
      // truncated: 240 characters of an unrelated section is enough to bias a
      // small model's topic without being enough to inform it.
      if (compact && !isFocus) return;
      state += `[${section.title}] (Status: ${section.status})\n`;
      // An agent always receives the sections it is writing in full — trimming
      // those would break the revision it was asked to make. Approved sections
      // are settled facts and are only trimmed under budget pressure.
      const limit = isFocus
        ? null
        : trimTo ?? (section.status === 'approved' ? null : 240);
      const content = limit === null
        ? section.content
        : `${section.content.substring(0, limit)}${section.content.length > limit ? '…' : ''}`;
      state += `${content}\n\n`;
    });
    return state;
  };

  let blueprintState = renderBlueprintState();

  if (maxContextTokens) {
    // Everything except the blueprint state is already committed, so the state
    // is what has to give. Each step trims the sections this call is not
    // writing harder; the first one that fits is used.
    const fixedTokens = estimateTokens(context) + estimateTokens(customInstruction);
    for (const step of TRIM_STEPS) {
      if (fixedTokens + estimateTokens(blueprintState) <= maxContextTokens) break;
      blueprintState = renderBlueprintState(step);
    }
  }

  if (!compact) {
    context += `--- CURRENT BLUEPRINT STATE ---\n${blueprintState}`;
  } else if (blueprintState) {
    // Named for what it is, so a small model treats it as text to revise
    // rather than as background it should restate.
    context += `--- CURRENT TEXT OF THE SECTION(S) YOU ARE WRITING ---\n${blueprintState}`;
  }

  if (customInstruction) {
    context += `\n--- CURRENT INSTRUCTION ---\n${customInstruction}\n`;
  }

  return context;
};
