import { create } from 'zustand';
import { cloneSerializable } from './persistence';

export const MEMORY_CATEGORIES = ['business', 'product', 'technical', 'marketing', 'scope'];
const CATEGORY_MAP = {
  Business: 'business', Product: 'product', Technical: 'technical', Marketing: 'marketing', Scope: 'scope'
};

const createEmptyMemory = () => ({
  business: {},
  product: {},
  technical: {},
  marketing: {},
  scope: {}
});

// No local persistence. Project selection clears this store; a panel-specific
// loader can hydrate it independently of the blueprint.
export const useProjectMemoryStore = create((set) => ({
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

  clearMemory: () => set({ memory: createEmptyMemory(), decisionHistory: [] })
}));
