import { GoogleGenAI } from '@google/genai';
import { useSettingsStore } from '../../store/useSettingsStore';

const withTimeout = (promiseFn, ms) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
  });
  return Promise.race([promiseFn(), timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export class GeminiProvider {
  constructor() {
    this.client = null;
  }

  async initialize() {
    const { apiKey } = useSettingsStore.getState();
    if (!apiKey) {
      throw new Error('Gemini API key is required but not configured.');
    }
    // Initialize the new Google GenAI SDK
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  isReady() {
    const { apiKey } = useSettingsStore.getState();
    return !!apiKey;
  }

  async generate({ systemPrompt, userPrompt, jsonSchema, maxTokens }) {
    if (!this.client) {
      await this.initialize();
    }

    const modelName = 'gemini-2.5-flash';
    const config = {
      systemInstruction: systemPrompt || undefined,
    };

    if (jsonSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = jsonSchema;
    }

    try {
      const response = await withTimeout(() => this.client.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config
      }), 60000);

      if (!response.text) {
        throw new Error('Gemini returned an empty response.');
      }
      return response.text;
    } catch (err) {
      console.error('[GeminiProvider] Generation failed:', err);
      throw err;
    }
  }

  cancel() {
    // Cancellation could be handled by AbortController in fetch if exposed by SDK,
    // but not strictly required for Version 1.
  }

  dispose() {
    this.client = null;
  }
}
