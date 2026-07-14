import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';

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

  let context = `--- STARTUP CONTEXT ---\n`;
  context += `Project Name: ${project?.name || 'Unknown'}\n`;
  context += `Project Description (PRIMARY SOURCE OF TRUTH — weigh this above the project name): ${project?.idea || 'Unknown'}\n`;
  context += `Domain: ${memory?.scope?.domain || 'Unknown'}\n`;
  context += `Industry: ${memory?.scope?.industry || 'Unknown'}\n`;
  context += `Project Type: ${memory?.scope?.project_type || 'Unknown'}\n`;
  context += `Business Model: ${memory?.scope?.business_model || 'Unknown'}\n`;
  context += `Budget: ${project?.budget || 'Unknown'}\n`;
  context += `Target Audience: ${project?.targetAudience || 'Unknown'}\n`;
  context += `Platform Preference: ${project?.platform || 'Not specified'}\n`;
  context += `Timeline: ${project?.timeline || 'Not specified'}\n`;
  context += `Team Size: ${project?.teamSize || 'Not specified'}\n`;
  context += `Project Priorities: ${project?.priorities || 'Not specified'}\n\n`;

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

  context += `--- CURRENT BLUEPRINT STATE ---\n`;
  Object.keys(blueprint).forEach(key => {
    const section = blueprint[key];
    if (section && section.content) {
      context += `[${section.title}] (Status: ${section.status})\n`;
      // Approved sections are settled decisions — give agents more of them.
      const excerptLength = section.status === 'approved' ? 400 : 200;
      context += `${section.content.substring(0, excerptLength)}...\n\n`;
    }
  });

  if (customInstruction) {
    context += `\n--- CURRENT INSTRUCTION ---\n${customInstruction}\n`;
  }

  return context;
};
