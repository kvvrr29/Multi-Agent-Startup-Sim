import { useSettingsStore } from '../../store/useSettingsStore';
const loadGenAI = () => import('@google/genai').then(m => m.GoogleGenAI);
import { useProjectStore } from '../../store/useProjectStore';
const MIN_CALL_INTERVAL_MS = 4200; // 14.2 requests per minute (avoids 15 RPM 60s sleep penalty)
const DEFAULT_RATE_LIMIT_DELAY_MS = 65_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const API_CALL_TIMEOUT_MS = 90_000; // 90s — allows enough room for slow responses
const STORAGE_KEY = 'gemini_last_call_ts';
const getLastCallTimestamp = () => parseInt(sessionStorage.getItem(STORAGE_KEY) || '0', 10);
const setLastCallTimestamp = (ts) => sessionStorage.setItem(STORAGE_KEY, String(ts));
const parseRetryDelayMs = (err) => {
  const msgMatch = String(err?.message || err).match(/retry in ([\d.]+)s/i);
  if (msgMatch) return Math.ceil(parseFloat(msgMatch[1]) * 1000) + 3000; // +3s buffer
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
const waitForCallSlot = async () => {
  const now = Date.now();
  const lastTs = getLastCallTimestamp();
  const elapsed = now - lastTs;
  if (elapsed < MIN_CALL_INTERVAL_MS && lastTs > 0) {
    const wait = MIN_CALL_INTERVAL_MS - elapsed;
    const waitSec = Math.ceil(wait / 1000);
    console.log(`[GeminiProvider] Rate-limit pacing: waiting ${waitSec}s before next call.`);
    try {
      useProjectStore.getState().addWorkflowEvent({
        type: 'system',
        message: `⏳ Free-tier pacing: waiting ${waitSec}s before next AI request…`,
        agent: 'mediator'
      });
    } catch { /* store not available during init — silently skip */ }
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
    if (!apiKey?.trim()) {
      this.client = null;
      return this.client;
    }
    const GoogleGenAI = await loadGenAI();
    this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
    return this.client;
  }

  isReady() {
    const { apiKey } = useSettingsStore.getState();
    return !!apiKey?.trim();
  }
  async _callOnce({ systemPrompt, userPrompt, jsonSchema }) {
    await waitForCallSlot();

    try {
      return await withApiTimeout(async () => {
        const config = {
          systemInstruction: systemPrompt || undefined,
          temperature: 0.7,
        };
        if (jsonSchema) {
          config.responseMimeType = 'application/json';
          config.responseSchema = jsonSchema;
        }
        const response = await this.client.models.generateContent({
          model: 'gemini-flash-latest',
          contents: userPrompt,
          config,
        });
        return response.text;
      });
    } catch (err) {
      if (isRateLimitError(err)) {
        setLastCallTimestamp(0);
        const delayMs = parseRetryDelayMs(err);
        const rich = new Error(`Rate limit exceeded. Waiting ${Math.ceil(delayMs / 1000)}s before retrying.`);
        rich.isRateLimit = true;
        rich.retryDelayMs = delayMs;
        throw rich;
      }
      throw err;
    }
  }
  async generate({ systemPrompt, userPrompt, jsonSchema }) {
    await this.initialize();

    if (!this.client) {
      const err = new Error('Gemini API key is not set. Go to Settings and add your key.');
      err.isPermanentFailure = true;
      throw err;
    }

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
