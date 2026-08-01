// OpenAIProvider — the official openai npm package, GPT-4o-mini by default.
// Rate limit pacing shares Gemini's sessionStorage key: both are cloud
// providers under similar quota concerns.

import { useSettingsStore } from '../../store/useSettingsStore';

// Loaded on demand so the SDK stays out of the bundle unless OpenAI is used.
const loadOpenAI = () => import('openai').then(m => m.default);

const DEFAULT_MODEL = 'gpt-4o-mini';
const API_CALL_TIMEOUT_MS = 90_000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const isRateLimitError = (err) =>
  err?.status === 429 ||
  String(err?.message || err).includes('429') ||
  String(err?.message || err).toLowerCase().includes('rate limit') ||
  String(err?.message || err).toLowerCase().includes('quota');

const parseRetryDelayMs = (err) => {
  // OpenAI includes: "Please retry after 20 seconds"
  const msgMatch = String(err?.message || err).match(/retry after (\d+)/i);
  if (msgMatch) return parseInt(msgMatch[1], 10) * 1000 + 2000;
  return 30_000; // default 30s
};

export class OpenAIProvider {
  constructor() {
    this.client = null;
  }

  async initialize() {
    const { openaiApiKey } = useSettingsStore.getState();
    if (openaiApiKey?.trim()) {
      const OpenAI = await loadOpenAI();
      this.client = new OpenAI({
        apiKey: openaiApiKey.trim(),
        dangerouslyAllowBrowser: true,
      });
    } else {
      this.client = null;
    }
  }

  isReady() {
    const { openaiApiKey } = useSettingsStore.getState();
    return !!openaiApiKey?.trim();
  }

  async generate({ systemPrompt, userPrompt, jsonSchema, maxTokens }) {
    await this.initialize();

    if (!this.client) {
      throw new Error('OpenAI API key is not set. Go to Settings and add your key.');
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const requestOptions = {
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.7,
    };

    // Only cap output when a caller asks; left unset the model stops on its
    // own, matching Gemini. A fixed ceiling truncates multi-section JSON.
    if (maxTokens) requestOptions.max_tokens = maxTokens;

    // If JSON schema requested, use structured output response format
    if (jsonSchema) {
      requestOptions.response_format = { type: 'json_object' };
      // Instruct the model to return valid JSON
      requestOptions.messages[requestOptions.messages.length - 1].content +=
        '\n\nRespond ONLY with valid JSON matching the schema. No markdown, no explanation.';
    }

    let attempt = 0;
    const MAX_RETRIES = 3;

    while (true) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CALL_TIMEOUT_MS);

        const completion = await this.client.chat.completions.create(
          requestOptions,
          { signal: controller.signal, maxRetries: 0 }
        );
        clearTimeout(timeoutId);

        const text = completion.choices[0]?.message?.content;
        if (!text) throw new Error('OpenAI returned an empty response.');
        return text;
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('OpenAI request timed out.');

        if (isRateLimitError(err)) {
          // If the error literally says you exceeded your quota, it means your balance is $0.00.
          // Retrying won't help, so we throw a permanent rate limit error immediately to trigger fallback.
          if (String(err?.message || err).includes('exceeded your current quota')) {
            const richErr = new Error(`OpenAI quota exceeded. ${err.message}`);
            richErr.isRateLimit = true;
            richErr.isPermanentRateLimit = true;
            throw richErr;
          }

          if (attempt < MAX_RETRIES) {
            const delay = parseRetryDelayMs(err);
            console.warn(
              `[OpenAIProvider] Rate limit hit (attempt ${attempt}/${MAX_RETRIES}). ` +
              `Sleeping ${Math.ceil(delay / 1000)}s then retrying.`
            );
            await sleep(delay);
            continue;
          }

          const richErr = new Error(`OpenAI rate limit exceeded. ${err.message}`);
          richErr.isRateLimit = true;
          richErr.isPermanentRateLimit = true;
          throw richErr;
        }

        if (err?.status === 401 || String(err?.message || err).includes('401')) {
          err.isPermanentFailure = true;
          throw err;
        }

        console.error('[OpenAIProvider] Generation failed:', err);
        throw err;
      }
    }
  }

  cancel() {}
  dispose() { this.client = null; }
}
