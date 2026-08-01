import { modelManager } from './ModelManager';
import { getProviderProfile } from './providerProfiles';
import { estimateTokens } from './tokenEstimate';
const DEFAULT_MAX_TOKENS = getProviderProfile('webllm').maxTokens;
const generationTimeoutMs = (maxTokens) =>
  Math.min(180_000, 30_000 + maxTokens * 100);

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
      const engine = await modelManager.initialize();
      this._activeEngine = engine;
      const queueWaitTimeMs = Math.round(performance.now() - t0);

      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: userPrompt });
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

      logDiagnostic('GENERATION', {
        'Prompt token estimate': estimateTokens(systemPrompt) + estimateTokens(userPrompt),
        'Requested max_tokens': max_tokens,
        'Queue wait time (ms)': queueWaitTimeMs
      });

      let text = '';
      let firstTokenMs = null;
      let finishReason = null;

      const timeoutMs = generationTimeoutMs(max_tokens);
      const generateWithTimeout = async () => {
        const stream = await engine.chat.completions.create(payload);
        for await (const chunk of stream) {
          if (!firstTokenMs) firstTokenMs = performance.now();
          text += chunk.choices[0]?.delta?.content || '';
          finishReason = chunk.choices[0]?.finish_reason || finishReason;
        }
      };

      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          this._interrupt();
          reject(new Error(`WebLLM generation timed out after ${timeoutMs / 1000}s.`));
        }, timeoutMs);
      });

      try {
        await Promise.race([generateWithTimeout(), timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
        this._activeEngine = null;
      }
      
      logDiagnostic('GENERATION COMPLETE', {
        'Time to first token (ms)': firstTokenMs ? Math.round(firstTokenMs - t0) : 'n/a',
        'Total time (ms)': Math.round(performance.now() - t0),
        'Output token estimate': estimateTokens(text),
        'Finish reason': finishReason || 'stop'
      });

      if (!text) throw new Error('WebLLM returned an empty response.');
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
  _interrupt() {
    const engine = this._activeEngine || modelManager.engine;
    try {
      const result = engine?.interruptGenerate?.();
      if (result && typeof result.catch === 'function') {
        result.catch(err => console.warn('[WebLLMProvider] interruptGenerate failed:', err));
      }
    } catch (err) {
      console.warn('[WebLLMProvider] interruptGenerate threw:', err);
    }
  }
  cancel() {
    this._interrupt();
  }

  dispose() {
    this._interrupt();
  }
}
