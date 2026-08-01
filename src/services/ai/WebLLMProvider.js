import { modelManager } from './ModelManager';
import { getProviderProfile } from './providerProfiles';
import { estimateTokens } from './tokenEstimate';

// For callers with no budget of their own (the classifier, the router). From
// the profile so there is one number, not two that drift.
const DEFAULT_MAX_TOKENS = getProviderProfile('webllm').maxTokens;

// How long before a generation counts as stuck. Scales with the budget, since
// a flat ceiling that fits a 700-token answer cuts a 1400-token one off
// mid-sentence: the allowance assumes a pessimistic ~10 tok/s plus load and
// prefill. A deadlock detector, not a pacing mechanism.
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

      // Ensure engine is fully initialized before generating
      const engine = await modelManager.initialize();
      // Held so cancel()/the timeout can interrupt this exact engine.
      this._activeEngine = engine;
      const queueWaitTimeMs = Math.round(performance.now() - t0);

      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: userPrompt });

      // The caller's per-section budget wins; it bounds worst-case generation
      // time and stops the model looping.
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

      // We wrap the active generation in a timeout Promise race
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
          // Rejecting the race only abandons the promise — the decode loop
          // keeps running on the GPU and would compete with the next section.
          // interruptGenerate actually stops the work.
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

      // finish_reason 'length' means the budget cut generation off, which for
      // JSON is unrecoverable — so surface it as a distinct, retryable
      // condition rather than letting it fail later as "bad content".
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

  // Stops in-flight decoding on the GPU; safe when nothing is running. Not
  // awaited: callers are already unwinding an error path.
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

  /** Aborts the current generation, e.g. when the user leaves or resets a run. */
  cancel() {
    this._interrupt();
  }

  dispose() {
    // We keep WebLLM alive in the singleton modelManager.
    this._interrupt();
  }
}
