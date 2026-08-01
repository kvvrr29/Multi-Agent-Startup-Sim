import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { SECTION_OWNERSHIP } from '../../config/sectionOwnership';
import { estimateTokens } from './tokenEstimate';

// Which memory categories are relevant to each agent (doc §13: the Mediator
// injects only the relevant memory into each agent request; scope is global).
const AGENT_MEMORY_CATEGORIES = {
  ceo: ['scope', 'business'],
  pm: ['scope', 'product', 'business'],
  developer: ['scope', 'technical', 'product'],
  marketing: ['scope', 'marketing', 'business'],
  mediator: ['scope', 'business', 'product', 'technical', 'marketing']
};

// Tried in order when the context overflows; first fit wins.
const TRIM_STEPS = [1600, 800, 400, 240, 120];

// An agent's whole view of a section it is not writing — the pipeline is
// sequential, so too tight and it writes against sentence fragments.
const NON_FOCUS_LIMIT = 800;

/**
 * The context block every agent request is grounded in. Both providers get the
 * same brief.
 *
 * focusSections   sections this call produces; always included in full, since
 *                 "make this longer" is meaningless without them
 * maxContextTokens  local only — approved sections are otherwise never
 *                 truncated, and seventeen of them overflow 8192 outright
 * compact         older, blunter alternative: drop rather than trim. Unused,
 *                 kept as the fallback if full context prefills too slowly.
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
  // ~40 tokens for all of them, and they are what stops output being generic:
  // a roadmap written without "6 months, 4 people" is filler.
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
    // One line each. Dropping them was a correctness bug: without them a
    // revision contradicts what an earlier one settled.
    context += `--- DECISIONS ALREADY SETTLED (do not contradict these) ---\n`;
    context += relevantDecisionHistory
      .map(d => `- ${d.key}: ${d.value}${d.rationale ? ` (${d.rationale})` : ''}`)
      .join('\n') + `\n\n`;
  }

  // trimTo overrides the standard rule: approved in full, the rest capped.
  const renderBlueprintState = (trimTo = null) => {
    // Sections being written are never trimmed; that would break the revision.
    const limitFor = (section, isFocus) => {
      if (isFocus) return null;
      const allowance = section.status === 'approved' ? null : NON_FOCUS_LIMIT;
      if (trimTo === null) return allowance;
      // A step can only tighten — widening a pending section would grow the
      // context the loop was called on to shrink.
      return allowance === null ? trimTo : Math.min(trimTo, allowance);
    };

    let state = '';
    Object.keys(blueprint).forEach(key => {
      const section = blueprint[key];
      if (!section || !section.content) return;
      const isFocus = focus ? focus.has(key) : SECTION_OWNERSHIP[key] === agentRole;
      // Compact drops rather than truncates: a fragment of an unrelated
      // section biases the topic without informing it.
      if (compact && !isFocus) return;
      state += `[${section.title}] (Status: ${section.status})\n`;
      const limit = limitFor(section, isFocus);
      const content = limit === null
        ? section.content
        : `${section.content.substring(0, limit)}${section.content.length > limit ? '…' : ''}`;
      state += `${content}\n\n`;
    });
    return state;
  };

  let blueprintState = renderBlueprintState();

  if (maxContextTokens) {
    // Everything else is committed, so the blueprint state is what gives.
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
