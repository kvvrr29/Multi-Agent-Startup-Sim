import { useAICostStore } from '../../store/useAICostStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { useProjectStore } from '../../store/useProjectStore';
import { WebLLMProvider } from './WebLLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { PROVIDER_LABELS, getActiveProviderName, getActiveProviderLabel } from './activeProvider';

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

/** The provider that actually served the most recent successful generation. */
let lastUsedProviderName = null;
export const getLastUsedProviderLabel = () =>
  lastUsedProviderName ? (PROVIDER_LABELS[lastUsedProviderName] || lastUsedProviderName) : null;

/**
 * Prompt cache. Identical (systemPrompt, userPrompt, provider) triples are
 * served from localStorage so reruns don't burn free-tier quota.
 */
const cacheKeyFor = async (systemPrompt, userPrompt, providerName) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const input = `${systemPrompt}|${userPrompt}|${providerName}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return `ai_cache_${Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
};

const readCache = (key) => {
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeCache = (key, value) => {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked — caching is best-effort, the generation still succeeded.
  }
};

/** Errors that another attempt against the same cloud provider cannot fix. */
const isExhaustedCloudQuota = (err) =>
  err?.isPermanentRateLimit ||
  err?.isPermanentFailure ||
  err?.status === 429 ||
  String(err?.message || err).includes('429') ||
  String(err?.message || err).toLowerCase().includes('rate limit') ||
  String(err?.message || err).toLowerCase().includes('quota');

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

  const settle = (responseText, usedProvider) => {
    recordUsage(estimateTokens(systemPrompt + userPrompt), estimateTokens(responseText));
    incrementSuccess();
    clearLastError();
    lastUsedProviderName = usedProvider;
    return responseText;
  };

  try {
    incrementSent();
    beginGeneration();

    const cacheKey = await cacheKeyFor(systemPrompt, userPrompt, providerName);
    const cached = readCache(cacheKey);
    if (cached) {
      console.log('[AI Cache] Reusing a cached response — no quota spent.');
      // A configured key is not a connection. Only a successful response earns it.
      setConnectionStatus('connected');
      return settle(cached, providerName);
    }

    const responseText = await provider.generate({ systemPrompt, userPrompt, jsonSchema, maxTokens });
    writeCache(cacheKey, responseText);
    setConnectionStatus('connected');
    return settle(responseText, providerName);
  } catch (err) {
    // Graceful degradation: when a cloud provider is out of quota we can finish
    // the run locally for free, but only with the user's consent — the local
    // model may need a multi-hundred-MB download first.
    if (providerName !== 'webllm' && isExhaustedCloudQuota(err)) {
      const consent = typeof window !== 'undefined' && window.confirm(
        'Cloud AI quota exhausted.\n\n' +
        'Your API key has run out of quota. The simulator can fall back to the ' +
        'built-in local AI to finish this generation for free.\n\n' +
        'The first local run downloads the model into your browser cache.\n\n' +
        'Switch to the local AI and continue?'
      );

      if (!consent) {
        incrementFailed();
        setLastError('rate_limit', err.message || 'Cloud AI quota exhausted and local fallback was declined.');
        throw err;
      }

      // Pin the project to WebLLM so the remaining sections don't re-prompt.
      const currentProject = useProjectStore.getState().project;
      if (currentProject) {
        useProjectStore.getState().setProject({ ...currentProject, aiProvider: 'webllm' });
      }

      console.warn('[AIProvider] Cloud quota exhausted — falling back to the built-in local AI.');
      setLastError('rate_limit', 'Cloud quota exhausted. Finishing the blueprint on the built-in local AI.');
      setConnectionStatus('fallback');

      try {
        const responseText = await aiProviderFactory.webllm.generate({
          systemPrompt, userPrompt, jsonSchema, maxTokens
        });
        writeCache(await cacheKeyFor(systemPrompt, userPrompt, 'webllm'), responseText);
        return settle(responseText, 'webllm');
      } catch (fallbackErr) {
        incrementFailed();
        setLastError('api_error', `Cloud AI and local fallback both failed: ${fallbackErr.message}`);
        throw fallbackErr;
      }
    }

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
