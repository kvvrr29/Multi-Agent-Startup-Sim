import { useSettingsStore } from '../../store/useSettingsStore';
import { useAICostStore } from '../../store/useAICostStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { GoogleGenAI } from '@google/genai';
import { api } from '../apiClient';

// Simple heuristic for tokens
const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);

/**
 * Server-side path: the Express backend holds the Gemini key and forwards the
 * request. The browser never sees or sends a Gemini API key.
 */
const generateViaProxy = async (systemPrompt, userPrompt, jsonSchema) => {
  const payload = await api.generate(systemPrompt, userPrompt, jsonSchema);
  return payload.text;
};

const generateViaBrowserKey = async (apiKey, systemPrompt, userPrompt, jsonSchema) => {
  const ai = new GoogleGenAI({ apiKey });
  const config = {
    systemInstruction: systemPrompt,
    temperature: 0.7,
  };
  if (jsonSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = jsonSchema;
  }
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userPrompt,
    config: config
  });
  return response.text;
};

export const generateAIContent = async (systemPrompt, userPrompt, jsonSchema = null) => {
  const { apiKey, aiProvider } = useSettingsStore.getState();
  const { recordUsage } = useAICostStore.getState();

  if (aiProvider !== 'gemini') {
    throw new Error(`Provider ${aiProvider} is not implemented yet.`);
  }

  const useBrowserKey = !!apiKey?.trim();
  const { incrementSent, incrementSuccess, incrementFailed, beginGeneration, endGeneration, setLastError, clearLastError, setConnectionStatus } = useAIDebugStore.getState();

  try {
    incrementSent();
    beginGeneration();
    const responseText = useBrowserKey
      ? await generateViaBrowserKey(apiKey, systemPrompt, userPrompt, jsonSchema)
      : await generateViaProxy(systemPrompt, userPrompt, jsonSchema);

    // Track costs
    const inputTokens = estimateTokens(systemPrompt + userPrompt);
    const outputTokens = estimateTokens(responseText);
    recordUsage(inputTokens, outputTokens);
    incrementSuccess();
    clearLastError();
    // A configured key is not a connection. Only a successful response earns it.
    setConnectionStatus('connected');

    return responseText;
  } catch (err) {
    incrementFailed();
    console.error("Gemini API Error:", err);
    if (err.status === 429) {
      setLastError('rate_limit', 'Rate limit exceeded.');
      throw new Error('Rate limit exceeded.');
    }
    if (err.status === 501 || err.code === 'not_configured') {
      setLastError('api_error', 'Server AI is not configured yet.');
      throw new Error('Server AI is not configured (no Gemini key on the server).');
    }
    setLastError('api_error', err.message || 'Unknown API error');
    throw new Error(`Gemini API failed: ${err.message}`);
  } finally {
    endGeneration();
  }
};
