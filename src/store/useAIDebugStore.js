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

  reset: () =>
    set({
      apiStats: { sent: 0, successful: 0, failed: 0 },
      generationSources: { domain: null, ceo: null, pm: null, developer: null, marketing: null },
      rawLogs: [],
    }),
}));
