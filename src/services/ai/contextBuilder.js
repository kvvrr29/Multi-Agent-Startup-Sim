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

export const buildContextString = (customInstruction = '', agentRole = 'mediator') => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();

  const { project, blueprint } = store;
  const memory = memoryStore.memory;
  const current = (category, key, original, fallback = 'Unknown') =>
    memory?.[category]?.[key] ?? original ?? fallback;

  let context = `--- STARTUP CONTEXT ---\n`;
  context += `Project Name: ${project?.name || 'Unknown'}\n`;
  context += `Project Description (PRIMARY SOURCE OF TRUTH — weigh this above the project name): ${project?.idea || 'Unknown'}\n`;
  context += `Domain: ${current('scope', 'domain', memory?.domain)}\n`;
  context += `Industry: ${current('scope', 'industry')}\n`;
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
  const relevantMemory = {};
  relevantCategories.forEach(cat => {
    const entries = memory?.[cat];
    if (entries && typeof entries === 'object' && Object.keys(entries).length > 0) {
      relevantMemory[cat] = entries;
    }
  });

  context += `--- PROJECT MEMORY (Decisions Made — relevant to your role) ---\n`;
  context += JSON.stringify(relevantMemory, null, 2) + `\n\n`;

  const relevantDecisionHistory = (memoryStore.decisionHistory || [])
    .filter(decision => relevantCategories.includes(String(decision.category || '').toLowerCase()))
    .slice(-12);
  if (relevantDecisionHistory.length) {
    context += `--- RELEVANT REVISION DECISIONS (append-only log) ---\n`;
    context += JSON.stringify(relevantDecisionHistory, null, 2) + `\n\n`;
  }

  const recentRevisions = (store.workflowEvents || []).filter(event => event.type === 'revision').slice(-5);
  if (recentRevisions.length) {
    context += `--- RECENT REVISION SUMMARIES ---\n`;
    context += recentRevisions.map(event => `- ${event.message}`).join('\n') + `\n\n`;
  }

  context += `--- CURRENT BLUEPRINT STATE ---\n`;
  Object.keys(blueprint).forEach(key => {
    const section = blueprint[key];
    if (section && section.content) {
      context += `[${section.title}] (Status: ${section.status})\n`;
      const isRelevant = SECTION_OWNERSHIP[key] === agentRole;
      // Approved sections are settled facts and are never truncated. Likewise,
      // an agent receives its own current sections in full for safe revisions.
      const content = section.status === 'approved' || isRelevant
        ? section.content
        : `${section.content.substring(0, 240)}${section.content.length > 240 ? '…' : ''}`;
      context += `${content}\n\n`;
    }
  });

  if (customInstruction) {
    context += `\n--- CURRENT INSTRUCTION ---\n${customInstruction}\n`;
  }

  return context;
};
