import { generateAIContent } from './aiProvider';
import { AGENT_SYSTEM_PROMPTS } from './agentPrompts';
import { buildContextString } from './contextBuilder';
import { validateAIResponse, createResponseSchema, buildRetryFeedback } from './validationLayer';
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
  const industry = memoryStore.memory?.scope?.industry || '';
  const keywordsStr = memoryStore.memory?.scope?.mandatory_entities || '';
  const mandatoryKeywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);

  const { setSource, pushLog } = useAIDebugStore.getState();
  const maxAttempts = 2;
  let retryFeedback = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rawResponse = null;
    let fallbackReason = null;
    try {
      const promptForAttempt = retryFeedback
        ? `${userPrompt}\n\n--- RETRY FEEDBACK ---\n${retryFeedback}`
        : userPrompt;

      rawResponse = await generateAIContent(systemPrompt, promptForAttempt, schema);
      const validation = validateAIResponse(rawResponse, sectionsToGenerate, { agentRole, domain, industry, mandatoryKeywords });

      if (validation.passed) {
        pushLog({ agent: agentRole, prompt: promptForAttempt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'PASSED', fallbackReason: null });
        setSource(agentRole, 'Gemini');
        return { content: validation.content, decisions: validation.decisions, scores: validation.scores };
      }

      fallbackReason = `Validation failed (overall ${validation.scores.overall}%): ${validation.issues.join(' ')}`;
      pushLog({ agent: agentRole, prompt: promptForAttempt.slice(0, 400), rawResponse: rawResponse.slice(0, 800), parsedJson: validation.content, scores: validation.scores, validationResult: 'FAILED', fallbackReason });
      retryFeedback = buildRetryFeedback(validation);
    } catch (err) {
      // API/network error — retry without feedback (nothing to correct)
      fallbackReason = err.message || 'Unknown error';
      pushLog({ agent: agentRole, prompt: userPrompt.slice(0, 400), rawResponse: rawResponse?.slice(0, 800) || null, parsedJson: null, scores: null, validationResult: 'FAILED', fallbackReason });
    }

    console.warn(`[AI Factory] Attempt ${attempt} failed for ${agentRole}: ${fallbackReason}`);
    if (attempt >= maxAttempts) {
      setSource(agentRole, 'Fallback');
      throw new Error(fallbackReason);
    }
  }
};
