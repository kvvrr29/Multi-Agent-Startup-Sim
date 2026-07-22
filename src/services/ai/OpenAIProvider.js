/**
 * OpenAIProvider — uses the official openai npm package.
 * Supports GPT-4o-mini by default (cheap, fast, high quality).
 * Rate limit pacing is shared via the same sessionStorage key as Gemini
 * since both are cloud providers subject to similar quota concerns.
 */

import OpenAI from 'openai';
import { useSettingsStore } from '../../store/useSettingsStore';

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

  initialize() {
    const { openaiApiKey } = useSettingsStore.getState();
    if (openaiApiKey?.trim()) {
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
    this.initialize();

    if (!this.client) {
      throw new Error('OpenAI API key is not set. Go to Settings and add your key.');
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const requestOptions = {
      model: DEFAULT_MODEL,
      messages,
      max_tokens: maxTokens || 2048,
      temperature: 0.7,
    };

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
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        const text = completion.choices[0]?.message?.content;
        if (!text) throw new Error('OpenAI returned an empty response.');
        return text;
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('OpenAI request timed out.');

        if (isRateLimitError(err) && attempt < MAX_RETRIES) {
          const delay = parseRetryDelayMs(err);
          console.warn(
            `[OpenAIProvider] Rate limit hit (attempt ${attempt}/${MAX_RETRIES}). ` +
            `Sleeping ${Math.ceil(delay / 1000)}s then retrying.`
          );
          await sleep(delay);
          continue;
        }

        if (isRateLimitError(err)) {
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
