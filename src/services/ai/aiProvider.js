import { useAICostStore } from '../../store/useAICostStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { WebLLMProvider } from './WebLLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { getActiveProviderName } from './activeProvider';
import { estimateTokens } from './tokenEstimate';

export { getActiveProviderName };

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

const aiProviderFactory = new AIProviderFactory();
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
    setConnectionStatus('connected');
    return settle(responseText);
  } catch (err) {
    incrementFailed();
    console.error(`[AIProvider] ${providerName} generation failed:`, err);

    if (err.status === 429 || err.isRateLimit) {
      setLastError('rate_limit', 'Rate limit exceeded.');
      throw new Error('Rate limit exceeded.');
    }
    setLastError('api_error', err.message || 'Unknown API error');
    throw err;
  } finally {
    endGeneration();
  }
};
