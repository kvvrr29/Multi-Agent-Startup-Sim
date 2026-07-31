import { useAICostStore } from '../../store/useAICostStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { WebLLMProvider } from './WebLLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { getActiveProviderName, getActiveProviderLabel } from './activeProvider';

export { getActiveProviderName, getActiveProviderLabel };

// Simple heuristic for tokens
const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);

class AIProviderFactory {
  constructor() {
    this.webllm = new WebLLMProvider();
    this.gemini = new GeminiProvider();
    this.openai = new OpenAIProvider();
  }

  get(name) {
    if (name === 'webllm') return this.webllm;
    if (name === 'openai') return this.openai;
    return this.gemini;
  }
}

export const aiProviderFactory = new AIProviderFactory();

/**
 * Generates content through the active provider and returns the raw response
 * text. Callers get a plain string, exactly as before the multi-provider work.
 */
export const generateAIContent = async (systemPrompt, userPrompt, jsonSchema = null, maxTokens = null) => {
  const providerName = getActiveProviderName();
  const provider = aiProviderFactory.get(providerName);
  const { recordUsage } = useAICostStore.getState();
  const {
    incrementSent, incrementSuccess, incrementFailed,
    beginGeneration, endGeneration,
    setLastError, clearLastError, setConnectionStatus
  } = useAIDebugStore.getState();

  const settle = (responseText) => {
    recordUsage(estimateTokens(systemPrompt + userPrompt), estimateTokens(responseText));
    incrementSuccess();
    clearLastError();
    return responseText;
  };

  try {
    incrementSent();
    beginGeneration();

    const responseText = await provider.generate({ systemPrompt, userPrompt, jsonSchema, maxTokens });
    // A configured key is not a connection. Only a successful response earns it.
    setConnectionStatus('connected');
    return settle(responseText);
  } catch (err) {
    // No cross-provider rescue here. A quota failure propagates to
    // simulationEngine, which already falls back to the template factory —
    // a predictable result that needs no download and cannot surprise the
    // user mid-run. Switching to the local model from this depth would also
    // hand it a prompt built for a cloud model and grade it on cloud gates.
    incrementFailed();
    console.error(`[AIProvider] ${providerName} generation failed:`, err);

    if (err.status === 429 || err.isRateLimit) {
      setLastError('rate_limit', 'Rate limit exceeded.');
      throw new Error('Rate limit exceeded.');
    }
    if (err.status === 501 || err.code === 'not_configured') {
      setLastError('api_error', 'Server AI is not configured yet.');
      throw new Error('Server AI is not configured (no Gemini key on the server).');
    }
    setLastError('api_error', err.message || 'Unknown API error');
    throw err;
  } finally {
    endGeneration();
  }
};
