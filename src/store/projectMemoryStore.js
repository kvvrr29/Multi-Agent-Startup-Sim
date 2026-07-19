import { create } from 'zustand';
import { cloneSerializable } from './persistence';

export const MEMORY_CATEGORIES = ['business', 'product', 'technical', 'marketing', 'scope'];
const CATEGORY_MAP = {
  Business: 'business', Product: 'product', Technical: 'technical', Marketing: 'marketing', Scope: 'scope'
};

export const createEmptyMemory = () => ({
  domain: '',
  business: {},
  product: {},
  technical: {},
  marketing: {},
  scope: {}
});

// No local persistence: hydrated from the cloud via openCloudProject().
export const useProjectMemoryStore = create((set, get) => ({
  memory: createEmptyMemory(),
  decisionHistory: [],

  updateMemory: (category, key, value) => {
    if (!MEMORY_CATEGORIES.includes(category) || !key) return;
    set((state) => ({
      memory: {
        ...state.memory,
        [category]: { ...(state.memory[category] || {}), [key]: value }
      }
    }));
  },

  applyDecision: (decision, metadata = {}) => {
    const category = CATEGORY_MAP[decision?.category];
    if (!category || !decision?.key) return false;
    const entry = {
      ...cloneSerializable(decision),
      // Stable id so cloud appends are idempotent (decision_entries.client_id).
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      agent: metadata.agent || null,
      instruction: metadata.instruction || null,
      version: metadata.version || null,
      timestamp: metadata.timestamp || new Date().toISOString()
    };
    set((state) => ({
      memory: {
        ...state.memory,
        [category]: { ...(state.memory[category] || {}), [decision.key]: decision.value }
      },
      decisionHistory: [...state.decisionHistory, entry]
    }));
    return true;
  },

  setDomain: (domain) => set((state) => ({
    memory: { ...state.memory, domain, scope: { ...(state.memory.scope || {}), domain } }
  })),

  getSnapshot: () => cloneSerializable({ memory: get().memory, decisionHistory: get().decisionHistory }),
  restoreSnapshot: (snapshot) => set({
    memory: { ...createEmptyMemory(), ...(snapshot?.memory || {}) },
    decisionHistory: Array.isArray(snapshot?.decisionHistory) ? cloneSerializable(snapshot.decisionHistory) : []
  }),
  clearMemory: () => set({ memory: createEmptyMemory(), decisionHistory: [] })
}));
