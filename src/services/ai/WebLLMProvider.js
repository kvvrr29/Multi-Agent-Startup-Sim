import { modelManager } from './ModelManager';

// Only used when a caller supplies no budget of its own.
const DEFAULT_MAX_TOKENS = 1500;

const logDiagnostic = (section, data) => {
  if (!import.meta.env.DEV) return;
  console.log(`\n==============================\n${section}\n==============================`);
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      console.log(`• ${key}: ${value}`);
    });
  }
};

export class WebLLMProvider {
  async initialize() {
    return await modelManager.initialize();
  }

  isReady() {
    return modelManager.getState().status === 'ready';
  }

  async generate({ systemPrompt, userPrompt, jsonSchema, maxTokens }) {
    try {
      const t0 = performance.now();
      const callStartIso = new Date().toISOString();
      
      // Ensure engine is fully initialized before generating
      const engine = await modelManager.initialize();
      const tInit = performance.now();
      const queueWaitTimeMs = Math.round(tInit - t0);
      
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: userPrompt });

      // The caller's per-section budget wins. It bounds worst-case generation
      // time and stops the model looping, which small models do. The 1500
      // default only applies when a caller supplies nothing.
      const max_tokens = maxTokens || DEFAULT_MAX_TOKENS;

      const payload = {
        model: modelManager.modelId,
        messages,
        temperature: 0.7,
        max_tokens,
        stream: true
      };

      if (jsonSchema) {
        payload.response_format = { 
          type: 'json_object',
          schema: JSON.stringify(jsonSchema)
        };
      }

      const promptTokenEstimate = Math.ceil((systemPrompt?.length + userPrompt?.length) / 4);
      
      console.log(`\n=====================================================`);
      console.log(`[Diagnostic] Prompt token estimate: ${promptTokenEstimate}`);
      console.log(`[Diagnostic] Requested max_tokens: ${max_tokens}`);
      console.log(`[Diagnostic] Queue wait time: ${queueWaitTimeMs}ms`);
      
      const generationStartTimeIso = new Date().toISOString();
      console.log(`Generation start: ${generationStartTimeIso}`);
      
      let text = '';
      let firstTokenMs = null;
      let actualTokens = 0;
      let finishReason = null;
      
      const timeoutMs = 60000;
      
      // We wrap the active generation in a timeout Promise race
      const generateWithTimeout = async () => {
        const stream = await engine.chat.completions.create(payload);
        for await (const chunk of stream) {
          if (!firstTokenMs) {
            firstTokenMs = performance.now();
            console.log(`First token timestamp: ${new Date().toISOString()}`);
          }
          text += chunk.choices[0]?.delta?.content || '';
          finishReason = chunk.choices[0]?.finish_reason || finishReason;
          actualTokens++;
        }
      };

      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      });
      
      await Promise.race([generateWithTimeout(), timeoutPromise]).finally(() => clearTimeout(timeoutId));
      
      const tEnd = performance.now();
      console.log(`Generation end: ${new Date().toISOString()}`);
      
      const outputTokensEstimate = Math.ceil(text.length / 4);
      console.log(`Output token estimate: ${outputTokensEstimate}`);
      console.log(`=====================================================\n`);
      


      if (!text) throw new Error('WebLLM returned an empty response.');

      // finish_reason 'length' means the budget cut generation off. For JSON
      // that is unrecoverable — an unterminated string cannot be repaired by
      // the parser — so surface it as a distinct, retryable condition rather
      // than letting it fail later as "bad content".
      if (finishReason === 'length') {
        const err = new Error(
          `WebLLM response was truncated at the ${max_tokens}-token budget.`
        );
        err.isTruncated = true;
        err.partialText = text;
        throw err;
      }

      return text;
    } catch (err) {
      logDiagnostic('ERRORS', {
        'Stage where it failed': 'Generation',
        'Complete error object': err.toString(),
        'Stack trace': err.stack,
        'User-friendly UI message': 'Failed to generate response. Please try again or switch to Gemini.'
      });
      console.error('[WebLLMProvider] Generation failed:', err);
      throw err;
    }
  }

  cancel() {}

  dispose() {
    // We keep WebLLM alive in the singleton modelManager.
  }
}
