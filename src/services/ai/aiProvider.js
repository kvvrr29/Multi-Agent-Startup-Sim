import { WebLLMProvider } from './WebLLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAICostStore } from '../../store/useAICostStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { useProjectStore } from '../../store/useProjectStore';

class AIProviderFactory {
  constructor() {
    this.webllm = new WebLLMProvider();
    this.gemini = new GeminiProvider();
    this.openai = new OpenAIProvider();
  }

  getActiveProvider() {
    const { aiProvider: globalProvider } = useSettingsStore.getState();
    const projectProvider = useProjectStore.getState().project?.aiProvider;
    const providerName = projectProvider || globalProvider || 'webllm';

    if (providerName === 'gemini') return this.gemini;
    if (providerName === 'openai') return this.openai;
    return this.webllm;
  }
}

export const aiProviderFactory = new AIProviderFactory();

// Simple heuristic for tokens
const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);

export const generateAIContent = async (systemPrompt, userPrompt, jsonSchema = null, maxTokens = null) => {
  const provider = aiProviderFactory.getActiveProvider();
  const { recordUsage } = useAICostStore.getState();
  const { incrementSent, incrementSuccess, incrementFailed, beginGeneration, endGeneration, setLastError, clearLastError, setConnectionStatus } = useAIDebugStore.getState();

  try {
    incrementSent();
    beginGeneration();
    
    const { aiProvider: globalProvider } = useSettingsStore.getState();
    const projectProvider = useProjectStore.getState().project?.aiProvider;
    const providerName = projectProvider || globalProvider || 'webllm';
    
    const responseText = await provider.generate({ systemPrompt, userPrompt, jsonSchema, maxTokens });

    // Track costs
    const inputTokens = estimateTokens(systemPrompt + userPrompt);
    const outputTokens = estimateTokens(responseText);
    recordUsage(inputTokens, outputTokens);
    incrementSuccess();
    clearLastError();
    setConnectionStatus('connected');

    return {
      responseText,
      providerName: providerName === 'gemini' ? 'Gemini' : providerName === 'openai' ? 'OpenAI (GPT-4o-mini)' : 'WebLLM'
    };
  } catch (err) {
    incrementFailed();
    console.error("[AIProvider] Error:", err);
    setLastError('api_error', err.message || 'Unknown API error');
    throw err;
  } finally {
    endGeneration();
  }
};
