import { create } from 'zustand';

export const useProjectMemoryStore = create((set, get) => ({
  memory: {
    domain: '',
    technical: {},
    business: {},
    marketing: {},
    scope: {}
  },

  updateMemory: (category, key, value) => set((state) => ({
    memory: {
      ...state.memory,
      [category]: {
        ...(typeof state.memory[category] === 'object' ? state.memory[category] : {}),
        [key]: value
      }
    }
  })),

  setDomain: (domain) => set((state) => ({
    memory: { ...state.memory, domain }
  })),

  clearMemory: () => set({
    memory: { domain: '', technical: {}, business: {}, marketing: {}, scope: {} }
  })
}));
