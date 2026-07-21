import { modelManager } from './ModelManager';

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

      const isDomainClassifier = systemPrompt?.includes('domain classifier');
      const max_tokens = maxTokens || (isDomainClassifier ? 150 : 1500);

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
      
      const timeoutMs = 120000;
      
      // We wrap the active generation in a timeout Promise race
      const generateWithTimeout = async () => {
        const stream = await engine.chat.completions.create(payload);
        for await (const chunk of stream) {
          if (!firstTokenMs) {
            firstTokenMs = performance.now();
            console.log(`First token timestamp: ${new Date().toISOString()}`);
          }
          text += chunk.choices[0]?.delta?.content || '';
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

  cancel() {
    // WebLLM currently does not have a simple abort signal in chat.completions without complex stream handling.
    // Left empty for interface compliance.
  }

  dispose() {
    // We keep WebLLM alive in the singleton modelManager.
  }
}
