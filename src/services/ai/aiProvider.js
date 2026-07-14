import { useSettingsStore } from '../../store/useSettingsStore';
import { useAICostStore } from '../../store/useAICostStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
import { GoogleGenAI } from '@google/genai';

// Simple heuristic for tokens
const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);

export const generateAIContent = async (systemPrompt, userPrompt, jsonSchema = null) => {
  const { apiKey, aiProvider } = useSettingsStore.getState();
  const { recordUsage } = useAICostStore.getState();

  if (!apiKey) {
    throw new Error('API Key missing. Please configure it in Settings.');
  }

  if (aiProvider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    const { incrementSent, incrementSuccess, incrementFailed, beginGeneration, endGeneration, setLastError, clearLastError, setConnectionStatus } = useAIDebugStore.getState();

    const config = {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    };

    if (jsonSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = jsonSchema;
    }

    try {
      incrementSent();
      beginGeneration();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: config
      });

      const responseText = response.text;

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
      setLastError('api_error', err.message || 'Unknown API error');
      throw new Error(`Gemini API failed: ${err.message}`);
    } finally {
      endGeneration();
    }
  }

  throw new Error(`Provider ${aiProvider} is not implemented yet.`);
};
