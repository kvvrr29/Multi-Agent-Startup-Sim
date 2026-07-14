import { generateAIContent } from './aiProvider';
import { AGENT_SYSTEM_PROMPTS } from './agentPrompts';
import { buildContextString } from './contextBuilder';
import { validateAIResponse, createResponseSchema } from './validationLayer';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { AGENT_ROLES } from '../../config/sectionOwnership';

// Sections each agent is responsible for generating (single source of truth).
const AGENT_RESPONSIBILITIES = AGENT_ROLES;

export const generateAgentContent = async (agentRole, instruction = '') => {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentRole];
  if (!systemPrompt) throw new Error(`Unknown agent role: ${agentRole}`);

  const context = buildContextString(instruction);
  const sectionsToGenerate = AGENT_RESPONSIBILITIES[agentRole] || [];
  
  const schema = createResponseSchema(sectionsToGenerate);
  
  const userPrompt = `${context}\n\nTask: Based on the context above, generate the following blueprint sections in detailed Markdown format: ${sectionsToGenerate.join(', ')}. Ensure the content is highly specific to this exact project and not generic. Do NOT include mermaid syntax unless specifically required by the section. Respond with JSON matching the requested schema.`;

  const memoryStore = useProjectMemoryStore.getState();
  const domain = memoryStore.memory?.scope?.domain || useProjectStore.getState().project?.domain || '';
  const keywordsStr = memoryStore.memory?.scope?.mandatory_entities || '';
  const mandatoryKeywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);

  const { setSource, pushLog } = useAIDebugStore.getState();
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    let rawResponse = null;
    try {
      attempts++;
      rawResponse = await generateAIContent(systemPrompt, userPrompt, schema);
      // Will throw if validation fails
      const validated = validateAIResponse(rawResponse, sectionsToGenerate, domain, mandatoryKeywords);
      pushLog({ agent: agentRole, prompt: userPrompt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validated, validationResult: 'PASSED', fallbackReason: null });
      setSource(agentRole, 'Gemini');
      return validated;
    } catch (err) {
      const fallbackReason = err.message || 'Unknown error';
      console.warn(`[AI Factory] Attempt ${attempts} failed for ${agentRole}: ${fallbackReason}`);
      pushLog({ agent: agentRole, prompt: userPrompt.slice(0, 400), rawResponse: rawResponse?.slice(0, 800) || null, parsedJson: null, validationResult: 'FAILED', fallbackReason });
      if (attempts >= maxAttempts) {
        setSource(agentRole, 'Fallback');
        throw err;
      }
    }
  }
};
