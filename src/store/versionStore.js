import { create } from 'zustand';
import { SECTION_TITLES } from '../config/blueprintSections';

// "Business Model, System Architecture Updated" style summaries (doc §14)
export const composeVersionSummary = (affectedSections = [], prefix = '') => {
  const titles = affectedSections.map(s => SECTION_TITLES[s] || s);
  let body;
  if (titles.length === 0) {
    body = 'Blueprint Updated';
  } else if (titles.length <= 3) {
    body = `${titles.join(', ')} Updated`;
  } else {
    body = `${titles.slice(0, 3).join(', ')} and ${titles.length - 3} more Updated`;
  }
  return prefix ? `${prefix} ${body}` : body;
};

export const useVersionStore = create((set, get) => ({
  versions: [],
  currentVersionId: null,

  saveVersion: (blueprint, summary, affectedAgents = [], affectedSections = []) => set((state) => {
    const newVersion = {
      id: `v${state.versions.length + 1}`,
      timestamp: new Date().toISOString(),
      summary,
      affectedAgents,
      affectedSections,
      blueprintSnapshot: JSON.parse(JSON.stringify(blueprint)) // Deep copy (includes content + approval state)
    };
    return {
      versions: [...state.versions, newVersion],
      currentVersionId: newVersion.id
    };
  }),

  restoreVersion: (versionId) => {
    const state = get();
    const version = state.versions.find(v => v.id === versionId);
    if (version) {
      set({ currentVersionId: versionId });
      return JSON.parse(JSON.stringify(version.blueprintSnapshot));
    }
    return null;
  },

  reset: () => set({ versions: [], currentVersionId: null })
}));

// Compares a version snapshot against another blueprint state.
// Returns { changed: [], added: [], removed: [] } of section keys.
export const diffBlueprints = (snapshot = {}, current = {}) => {
  const changed = [];
  const added = [];
  const removed = [];
  const keys = new Set([...Object.keys(snapshot), ...Object.keys(current)]);

  keys.forEach(key => {
    const before = snapshot[key]?.content?.trim() || '';
    const after = current[key]?.content?.trim() || '';
    if (before && !after) removed.push(key);
    else if (!before && after) added.push(key);
    else if (before && after && before !== after) changed.push(key);
  });

  return { changed, added, removed };
};
