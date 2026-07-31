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

/**
 * Builds the context block every agent request is grounded in.
 *
 * Both providers use this one builder — the shape of the context is a property
 * of the project, not of the model. `compact` only controls how much of it a
 * model with a small window is asked to hold:
 *
 *   compact: false  the full brief (cloud default, unchanged)
 *   compact: true   the same facts, minus the parts that cost the most tokens
 *                   per unit of usefulness — the raw memory JSON, the decision
 *                   log, and the text of sections this call is not writing.
 *
 * `focusSections` names the sections this call is actually producing. Their
 * current text is always included in full, because a revision instruction like
 * "make this longer" is meaningless without it.
 */
export const buildContextString = (
  customInstruction = '',
  agentRole = 'mediator',
  { compact = false, focusSections = null } = {}
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

  let blueprintState = '';
  Object.keys(blueprint).forEach(key => {
    const section = blueprint[key];
    if (!section || !section.content) return;
    const isFocus = focus ? focus.has(key) : SECTION_OWNERSHIP[key] === agentRole;
    // In compact mode everything outside the focus set is dropped rather than
    // truncated: 240 characters of an unrelated section is enough to bias a
    // small model's topic without being enough to inform it.
    if (compact && !isFocus) return;
    blueprintState += `[${section.title}] (Status: ${section.status})\n`;
    // Approved sections are settled facts and are never truncated. Likewise,
    // an agent receives its own current sections in full for safe revisions.
    const content = section.status === 'approved' || isFocus
      ? section.content
      : `${section.content.substring(0, 240)}${section.content.length > 240 ? '…' : ''}`;
    blueprintState += `${content}\n\n`;
  });

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
