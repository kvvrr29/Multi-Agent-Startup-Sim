import { create } from 'zustand';

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

  pushLog: (entry) =>
    set((s) => ({
      rawLogs: [
        {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          ...entry,
        },
        ...s.rawLogs.slice(0, 99), // keep last 100
      ],
    })),

  clearLogs: () => set({ rawLogs: [] }),

  beginGeneration: () =>
    set((s) => ({ activeGenerations: s.activeGenerations + 1 })),

  endGeneration: () =>
    set((s) => ({ activeGenerations: Math.max(0, s.activeGenerations - 1) })),

  setLastError: (kind, message) =>
    set({ lastError: { kind, message, timestamp: new Date().toISOString() } }),

  clearLastError: () => set({ lastError: null }),

  reset: () =>
    set({
      apiStats: { sent: 0, successful: 0, failed: 0 },
      generationSources: { domain: null, ceo: null, pm: null, developer: null, marketing: null },
      rawLogs: [],
      activeGenerations: 0,
      lastError: null,
    }),
}));
