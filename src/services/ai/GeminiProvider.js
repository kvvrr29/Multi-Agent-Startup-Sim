import { GoogleGenAI } from '@google/genai';
import { useSettingsStore } from '../../store/useSettingsStore';
import { api } from '../apiClient';
import { useProjectStore } from '../../store/useProjectStore';

// Gemini Free Tier: 5 requests per minute = 1 every 12s.
// 13s spacing keeps us safely under quota and avoids 60s freeze-on-429.
// Paid tier users will barely notice the 13s gaps vs the 60s pauses they'd otherwise get.
const MIN_CALL_INTERVAL_MS = 13_000;
const DEFAULT_RATE_LIMIT_DELAY_MS = 65_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const API_CALL_TIMEOUT_MS = 90_000; // 90s — allows enough room for slow responses

// Persist lastCallTimestamp in sessionStorage so pacing survives page reloads.
// This prevents the first call of a new run from firing into an already-exhausted quota window.
const STORAGE_KEY = 'gemini_last_call_ts';
const getLastCallTimestamp = () => parseInt(sessionStorage.getItem(STORAGE_KEY) || '0', 10);
const setLastCallTimestamp = (ts) => sessionStorage.setItem(STORAGE_KEY, String(ts));

/**
 * Parse the recommended retry delay from a Gemini 429 error.
 * Gemini includes it in two places:
 *  1. The human-readable message:  "Please retry in 37.6s."
 *  2. The structured RetryInfo detail object.
 */
const parseRetryDelayMs = (err) => {
  // 1. From the error message string (most reliable for the @google/genai SDK)
  const msgMatch = String(err?.message || err).match(/retry in ([\d.]+)s/i);
  if (msgMatch) return Math.ceil(parseFloat(msgMatch[1]) * 1000) + 3000; // +3s buffer

  // 2. From the structured details array
  const details = err?.error?.details || err?.details || [];
  const retryInfo = Array.isArray(details)
    ? details.find(d => d?.['@type']?.endsWith('RetryInfo'))
    : null;
  if (retryInfo?.retryDelay) {
    const s = parseFloat(retryInfo.retryDelay.replace('s', ''));
    if (!isNaN(s) && s > 0) return Math.ceil(s * 1000) + 3000;
  }

  return DEFAULT_RATE_LIMIT_DELAY_MS;
};

const isRateLimitError = (err) =>
  err?.status === 429 ||
  err?.error?.code === 429 ||
  String(err?.message || err).includes('429') ||
  String(err?.message || err).toLowerCase().includes('resource_exhausted') ||
  String(err?.message || err).toLowerCase().includes('quota');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const withApiTimeout = (promiseFn) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timeout')), API_CALL_TIMEOUT_MS);
  });
  return Promise.race([promiseFn(), timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

/**
 * Proactive rate-limit pacing.
 * Waits until enough time has elapsed since the last API call before proceeding.
 * Posts a visible workflow event so users see a countdown instead of a frozen screen.
 */
const waitForCallSlot = async () => {
  const now = Date.now();
  const lastTs = getLastCallTimestamp();
  const elapsed = now - lastTs;
  if (elapsed < MIN_CALL_INTERVAL_MS && lastTs > 0) {
    const wait = MIN_CALL_INTERVAL_MS - elapsed;
    const waitSec = Math.ceil(wait / 1000);
    console.log(`[GeminiProvider] Rate-limit pacing: waiting ${waitSec}s before next call.`);
    // Show visible status in UI so users know generation is progressing, not frozen
    try {
      useProjectStore.getState().addWorkflowEvent({
        type: 'system',
        message: `⏳ Free-tier pacing: waiting ${waitSec}s before next AI request…`,
        agent: 'mediator'
      });
    } catch (_) { /* store not available during init — silently skip */ }
    await sleep(wait);
  }
  setLastCallTimestamp(Date.now());
};


export class GeminiProvider {
  constructor() {
    this.client = null;
  }

  async initialize() {
    const { apiKey } = useSettingsStore.getState();
    if (apiKey?.trim()) {
      this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
    } else {
      this.client = null; // Proxy mode
    }
    return this.client;
  }

  isReady() {
    // Gemini is always ready (direct key OR server proxy)
    return true;
  }

  /**
   * Makes a single raw API call, no retry logic here.
   * Applies proactive pacing before calling, and throws enriched errors on 429.
   */
  async _callOnce({ systemPrompt, userPrompt, jsonSchema }) {
    // Proactively pace to avoid hitting the free-tier quota
    await waitForCallSlot();

    try {
      return await withApiTimeout(async () => {
        if (this.client) {
          // Browser Mode: user provided API key
          const config = {
            systemInstruction: systemPrompt || undefined,
            temperature: 0.7,
          };
          if (jsonSchema) {
            config.responseMimeType = 'application/json';
            config.responseSchema = jsonSchema;
          }
          const response = await this.client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: userPrompt,
            config,
          });
          return response.text;
        } else {
          // Server Proxy Mode: no browser key
          const payload = await api.generate(systemPrompt, userPrompt, jsonSchema);
          return payload.text;
        }
      });
    } catch (err) {
      if (isRateLimitError(err)) {
        // Reset lastCallTimestamp so the next attempt gets a fresh pacing slot
        lastCallTimestamp = 0;
        const delayMs = parseRetryDelayMs(err);
        const rich = new Error(`Rate limit exceeded. Waiting ${Math.ceil(delayMs / 1000)}s before retrying.`);
        rich.isRateLimit = true;
        rich.retryDelayMs = delayMs;
        throw rich;
      }
      if (err.status === 501 || err.code === 'not_configured') {
        throw new Error('Server AI is not configured. Set GEMINI_API_KEY on the server or provide an API key in Settings.');
      }
      throw err;
    }
  }

  /**
   * Public method called by the factory.
   * Handles rate-limit retries internally so the factory retry loop
   * only deals with validation failures, not quota errors.
   */
  async generate({ systemPrompt, userPrompt, jsonSchema, maxTokens }) {
    await this.initialize();

    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const text = await this._callOnce({ systemPrompt, userPrompt, jsonSchema });
        if (!text) throw new Error('Gemini returned an empty response.');
        return text;
      } catch (err) {
        if (err.isRateLimit && attempt < MAX_RATE_LIMIT_RETRIES) {
          console.warn(
            `[GeminiProvider] Rate limit hit (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). ` +
            `Sleeping ${Math.ceil(err.retryDelayMs / 1000)}s then retrying.`
          );
          await sleep(err.retryDelayMs);
          continue; // retry after sleep
        }

        // Permanent failure — tag the error so the factory does NOT retry it.
        // GeminiProvider already tried MAX_RATE_LIMIT_RETRIES times; another factory
        // retry would just create another 60s+ sleep loop on top.
        console.error('[GeminiProvider] Generation failed permanently:', err);
        if (err.isRateLimit) {
          err.isPermanentRateLimit = true;
        }
        if (err?.status === 401 || String(err?.message || err).includes('401') || String(err?.message || err).includes('API key not valid')) {
          err.isPermanentFailure = true;
        }
        throw err;
      }
    }
  }

  cancel() {}
  dispose() { this.client = null; }
}
