import { create } from 'zustand';

export const useVersionStore = create((set, get) => ({
  versions: [],
  currentVersionId: null,

  saveVersion: (blueprint, summary, affectedAgents = []) => set((state) => {
    const newVersion = {
      id: `v${state.versions.length + 1}`,
      timestamp: new Date().toISOString(),
      summary,
      affectedAgents,
      blueprintSnapshot: JSON.parse(JSON.stringify(blueprint)) // Deep copy
    };
    return {
      versions: [...state.versions, newVersion],
      currentVersionId: newVersion.id
    };
  }),

  restoreVersion: (versionId) => {
    // In a real app, this would dispatch to useProjectStore to overwrite the blueprint.
    // For now, we will expose the snapshot so the UI/simulation engine can apply it.
    const state = get();
    const version = state.versions.find(v => v.id === versionId);
    return version ? version.blueprintSnapshot : null;
  },

  reset: () => set({ versions: [], currentVersionId: null })
}));
