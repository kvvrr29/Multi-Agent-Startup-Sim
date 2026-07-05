import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';

export const buildContextString = (customInstruction = '') => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();
  
  const { project, blueprint } = store;
  const memory = memoryStore.memory;

  let context = `--- STARTUP CONTEXT ---\n`;
  context += `Project Name: ${project?.name || 'Unknown'}\n`;
  context += `Project Idea: ${project?.idea || 'Unknown'}\n`;
  context += `Domain: ${memory?.scope?.domain || 'Unknown'}\n`;
  context += `Industry: ${memory?.scope?.industry || 'Unknown'}\n`;
  context += `Project Type: ${memory?.scope?.project_type || 'Unknown'}\n`;
  context += `Business Model: ${memory?.scope?.business_model || 'Unknown'}\n`;
  context += `Budget: ${project?.budget || 'Unknown'}\n`;
  context += `Target Audience: ${project?.targetAudience || 'Unknown'}\n\n`;

  console.log("[ContextBuilder] Injected Context Fields:", {
    domain: memory?.scope?.domain,
    industry: memory?.scope?.industry,
    projectType: memory?.scope?.project_type,
    businessModel: memory?.scope?.business_model
  });

  context += `--- PROJECT MEMORY (Decisions Made) ---\n`;
  context += JSON.stringify(memory, null, 2) + `\n\n`;

  context += `--- CURRENT BLUEPRINT STATE ---\n`;
  // Only send titles and statuses to save tokens, unless we specifically need content.
  // For V2.0 we'll send approved summaries or short versions.
  Object.keys(blueprint).forEach(key => {
    const section = blueprint[key];
    if (section && section.content) {
      context += `[${section.title}] (Status: ${section.status})\n`;
      // Include first 200 chars as summary to give context without blowing up tokens
      context += `${section.content.substring(0, 200)}...\n\n`;
    }
  });

  if (customInstruction) {
    context += `\n--- CURRENT INSTRUCTION ---\n${customInstruction}\n`;
  }

  return context;
};
