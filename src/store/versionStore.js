import { create } from 'zustand';
import { SECTION_TITLES } from '../config/blueprintSections';
import { cloneSerializable } from './persistence';

export const composeVersionSummary = (affectedSections = [], prefix = '') => {
  const titles = affectedSections.map(s => SECTION_TITLES[s] || s);
  const body = titles.length === 0
    ? 'Blueprint Updated'
    : titles.length <= 3
      ? `${titles.join(', ')} Updated`
      : `${titles.slice(0, 3).join(', ')} and ${titles.length - 3} more Updated`;
  return prefix ? `${prefix} ${body}` : body;
};

const snapshotProvenance = (blueprint = {}) => Object.fromEntries(
  Object.entries(blueprint).map(([key, section]) => [key, {
    generationSource: section?.generationSource || null,
    generatedBy: section?.generatedBy || null,
    validationScores: section?.validationScores || null,
    generatedAt: section?.generatedAt || null,
    failureReason: section?.failureReason || null
  }])
);

const nextVersionId = (versions) => {
  const max = versions.reduce((value, version) => Math.max(value, Number(String(version.id).replace(/^v/, '')) || 0), 0);
  return `v${max + 1}`;
};

// No local persistence: hydrated from the cloud via openCloudProject().
export const useVersionStore = create((set, get) => ({
  versions: [],
  currentVersionId: null,

  saveVersion: (blueprint, summary, affectedAgents = [], affectedSections = [], options = {}) => {
    const id = nextVersionId(get().versions);
    const blueprintSnapshot = cloneSerializable(blueprint || {});
    const version = {
      id,
      timestamp: new Date().toISOString(),
      summary,
      changeType: options.changeType || 'revision',
      completionStatus: options.completionStatus || 'success',
      approvalState: Object.fromEntries(Object.entries(blueprintSnapshot).map(([key, section]) => [key, section?.status || 'pending'])),
      affectedAgents: [...new Set(affectedAgents)],
      affectedSections: [...new Set(affectedSections)],
      blueprintSnapshot,
      memorySnapshot: cloneSerializable(options.memorySnapshot || null),
      provenanceSnapshot: cloneSerializable(options.provenanceSnapshot || snapshotProvenance(blueprintSnapshot)),
      restoredFrom: options.restoredFrom || null
    };
    set((state) => ({ versions: [...state.versions, version], currentVersionId: id }));
    return cloneSerializable(version);
  },

  getVersion: (versionId) => {
    const version = get().versions.find(item => item.id === versionId);
    return version ? cloneSerializable(version) : null;
  },
  // Kept as a read-only compatibility alias; history never moves backwards.
  restoreVersion: (versionId) => get().getVersion(versionId)?.blueprintSnapshot || null,
  reset: () => set({ versions: [], currentVersionId: null })
}));

const stableSectionState = (section = {}) => ({
  content: section.content || '',
  status: section.status || 'pending',
  generationSource: section.generationSource || null,
  generatedBy: section.generatedBy || null,
  validationScores: section.validationScores || null,
  generatedAt: section.generatedAt || null,
  failureReason: section.failureReason || null
});

export const diffBlueprints = (snapshot = {}, current = {}) => {
  const changed = [];
  const added = [];
  const removed = [];
  const keys = new Set([...Object.keys(snapshot), ...Object.keys(current)]);
  keys.forEach(key => {
    const before = stableSectionState(snapshot[key]);
    const after = stableSectionState(current[key]);
    if (before.content.trim() && !after.content.trim()) removed.push(key);
    else if (!before.content.trim() && after.content.trim()) added.push(key);
    else if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(key);
  });
  return { changed, added, removed };
};

export const diffVersionState = (version = {}, currentBlueprint = {}, currentMemory = null) => ({
  blueprint: diffBlueprints(version.blueprintSnapshot || {}, currentBlueprint),
  memoryChanged: JSON.stringify(version.memorySnapshot || null) !== JSON.stringify(currentMemory || null),
  provenanceChanged: JSON.stringify(version.provenanceSnapshot || null) !== JSON.stringify(snapshotProvenance(currentBlueprint))
});
