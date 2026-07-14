import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

const redact = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s,}"']+/gi, '$1[REDACTED]');
};

const sanitizeLog = (entry) => Object.fromEntries(
  Object.entries(entry || {}).map(([key, value]) => [key, typeof value === 'string' ? redact(value) : value])
);

export const useAIDebugStore = create((set) => ({
  // API-level counters
  apiStats: { sent: 0, successful: 0, failed: 0 },

  // Per-agent generation source: 'Gemini' | 'Fallback' | null
  generationSources: {
    domain: null,
    ceo: null,
    pm: null,
    developer: null,
    marketing: null,
  },

  // Raw log entries (most recent first)
  rawLogs: [],

  // Live status signals for the AI status indicator (doc §12)
  activeGenerations: 0,
  lastError: null, // { kind: 'rate_limit' | 'api_error', message, timestamp }
  connectionStatus: 'configured', // configured | generating | connected | rate_limited | api_error | fallback

  // ── actions ──────────────────────────────────────────────────────────────

  incrementSent: () =>
    set((s) => ({ apiStats: { ...s.apiStats, sent: s.apiStats.sent + 1 } })),

  incrementSuccess: () =>
    set((s) => ({
      apiStats: { ...s.apiStats, successful: s.apiStats.successful + 1 },
    })),

  incrementFailed: () =>
    set((s) => ({
      apiStats: { ...s.apiStats, failed: s.apiStats.failed + 1 },
    })),

  setSource: (agent, source) =>
    set((s) => ({
      generationSources: { ...s.generationSources, [agent]: source },
    })),

  pushLog: (entry) => {
    if (!useSettingsStore.getState().developerMode) return;
    set((s) => ({
      rawLogs: [
        {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          ...sanitizeLog(entry),
        },
        ...s.rawLogs.slice(0, 99), // keep last 100
      ],
    }));
  },

  clearLogs: () => set({ rawLogs: [] }),

  beginGeneration: () =>
    set((s) => ({ activeGenerations: s.activeGenerations + 1, connectionStatus: 'generating' })),

  endGeneration: () =>
    set((s) => ({ activeGenerations: Math.max(0, s.activeGenerations - 1) })),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setLastError: (kind, message) =>
    set({
      lastError: { kind, message: redact(message), timestamp: new Date().toISOString() },
      connectionStatus: kind === 'rate_limit' ? 'rate_limited' : 'api_error'
    }),

  clearLastError: () => set({ lastError: null }),

  reset: () =>
    set({
      apiStats: { sent: 0, successful: 0, failed: 0 },
      generationSources: { domain: null, ceo: null, pm: null, developer: null, marketing: null },
      rawLogs: [],
      activeGenerations: 0,
      lastError: null,
      connectionStatus: 'configured',
    }),
}));
