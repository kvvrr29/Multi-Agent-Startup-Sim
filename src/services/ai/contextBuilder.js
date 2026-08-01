import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { SECTION_OWNERSHIP } from '../../config/sectionOwnership';
import { estimateTokens } from './tokenEstimate';
const AGENT_MEMORY_CATEGORIES = {
  ceo: ['scope', 'business'],
  pm: ['scope', 'product', 'business'],
  developer: ['scope', 'technical', 'product'],
  marketing: ['scope', 'marketing', 'business'],
  mediator: ['scope', 'business', 'product', 'technical', 'marketing']
};
const TRIM_STEPS = [1600, 800, 400, 240, 120];
const NON_FOCUS_LIMIT = 800;
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
  context += `Project Type: ${current('scope', 'project_type')}\n`;
  context += `Business Model: ${current('scope', 'business_model')}\n`;
  context += `Budget: ${current('scope', 'budget', project?.budget)}\n`;
  context += `Target Audience: ${current('business', 'targetAudience', project?.targetAudience)}\n`;
  context += `Platform Preference: ${current('scope', 'platforms', project?.platform, 'Not specified')}\n`;
  context += `Timeline: ${current('scope', 'timeline', project?.timeline, 'Not specified')}\n`;
  context += `Team Size: ${current('scope', 'teamSize', project?.teamSize, 'Not specified')}\n`;
  context += `Project Priorities: ${current('scope', 'priorities', project?.priorities, 'Not specified')}\n\n`;
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
    context += `--- DECISIONS ALREADY SETTLED (do not contradict these) ---\n`;
    context += relevantDecisionHistory
      .map(d => `- ${d.key}: ${d.value}${d.rationale ? ` (${d.rationale})` : ''}`)
      .join('\n') + `\n\n`;
  }
  const renderBlueprintState = (trimTo = null) => {
    const limitFor = (section, isFocus) => {
      if (isFocus) return null;
      const allowance = section.status === 'approved' ? null : NON_FOCUS_LIMIT;
      if (trimTo === null) return allowance;
      return allowance === null ? trimTo : Math.min(trimTo, allowance);
    };

    let state = '';
    Object.keys(blueprint).forEach(key => {
      const section = blueprint[key];
      if (!section || !section.content) return;
      const isFocus = focus ? focus.has(key) : SECTION_OWNERSHIP[key] === agentRole;
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
    const fixedTokens = estimateTokens(context) + estimateTokens(customInstruction);
    for (const step of TRIM_STEPS) {
      if (fixedTokens + estimateTokens(blueprintState) <= maxContextTokens) break;
      blueprintState = renderBlueprintState(step);
    }
  }

  if (!compact) {
    context += `--- CURRENT BLUEPRINT STATE ---\n${blueprintState}`;
  } else if (blueprintState) {
    context += `--- CURRENT TEXT OF THE SECTION(S) YOU ARE WRITING ---\n${blueprintState}`;
  }

  if (customInstruction) {
    context += `\n--- CURRENT INSTRUCTION ---\n${customInstruction}\n`;
  }

  return context;
};
