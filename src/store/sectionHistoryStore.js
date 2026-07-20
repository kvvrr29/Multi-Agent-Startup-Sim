import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getBrowserStorage } from './persistence';
import { useProjectStore } from './useProjectStore';

/**
 * Per-section version history, kept CLIENT-SIDE ONLY (persisted to localStorage,
 * keyed by project id). Each content change during prep appends a version; the
 * user scrolls versions with the ‹ › arrows. Approving a section is the only
 * thing that writes it to the database (via the cloudSync approved-only gate);
 * the moment it is approved its client-side drafts are DELETED — the approved
 * content now lives in the DB, so the history store only ever holds unapproved
 * sections.
 *
 * Approval is locked off the blueprint's status ('approved'), which is what the
 * DB hydrates on reload — so an approved section stays frozen with no local
 * history entry at all.
 *
 * useProjectStore.blueprint remains the render surface: this store projects the
 * active version's content into it through updateBlueprintSection (a plain
 * display setter that records no history, so there is no circular recording).
 */

const emptyEntry = () => ({ versions: [], activeIndex: 0 });

const isLocked = (sectionKey) =>
  useProjectStore.getState().blueprint[sectionKey]?.status === 'approved';

const versionMetadata = (v = {}) => ({
  generationSource: v.generationSource ?? null,
  generatedBy: v.generatedBy ?? null,
  validationScores: v.validationScores ?? null,
  generatedAt: v.generatedAt ?? null,
  failureReason: v.failureReason ?? null
});

const makeVersion = (content, metadata = {}) => ({
  content,
  ...versionMetadata(metadata),
  timestamp: metadata.timestamp || new Date().toISOString()
});

const versionFromDbRow = (row = {}) => ({
  content: row.content || '',
  generationSource: row.generation_source ?? null,
  generatedBy: row.generated_by ?? null,
  validationScores: row.validation_scores ?? null,
  generatedAt: row.generated_at ?? null,
  failureReason: row.failure_reason ?? null,
  timestamp: row.updated_at || new Date().toISOString()
});

// Push a version's content into the blueprint store so the rest of the app
// (rendering, export, health inspector) sees the currently-viewed content.
const project = (sectionKey, version, approved = false) => {
  if (!version) return;
  useProjectStore.getState().updateBlueprintSection(
    sectionKey,
    version.content,
    approved ? 'approved' : 'pending',
    versionMetadata(version)
  );
};

export const useSectionHistoryStore = create(persist((set, get) => ({
  activeProjectId: null,
  byProject: {},

  // Read helpers ------------------------------------------------------------
  getEntry: (sectionKey) => {
    const { activeProjectId, byProject } = get();
    return byProject[activeProjectId]?.[sectionKey] || null;
  },
  versionInfo: (sectionKey) => {
    const entry = get().getEntry(sectionKey);
    if (!entry) return { index: 0, count: 0 };
    return { index: entry.activeIndex, count: entry.versions.length };
  },

  // Mutations ---------------------------------------------------------------
  addVersion: (sectionKey, content, metadata = {}) => {
    const { activeProjectId, byProject } = get();
    if (!activeProjectId || isLocked(sectionKey)) return false; // approved = frozen
    const existing = byProject[activeProjectId]?.[sectionKey] || emptyEntry();
    const versions = [...existing.versions, makeVersion(content, metadata)];
    const entry = { versions, activeIndex: versions.length - 1 };
    set((state) => ({
      byProject: {
        ...state.byProject,
        [activeProjectId]: { ...(state.byProject[activeProjectId] || {}), [sectionKey]: entry }
      }
    }));
    project(sectionKey, entry.versions[entry.activeIndex]);
    return true;
  },

  setActiveIndex: (sectionKey, index) => {
    const { activeProjectId, byProject } = get();
    const entry = byProject[activeProjectId]?.[sectionKey];
    if (!entry || isLocked(sectionKey) || entry.versions.length === 0) return;
    const clamped = Math.max(0, Math.min(index, entry.versions.length - 1));
    if (clamped === entry.activeIndex) return;
    set((state) => ({
      byProject: {
        ...state.byProject,
        [activeProjectId]: {
          ...state.byProject[activeProjectId],
          [sectionKey]: { ...entry, activeIndex: clamped }
        }
      }
    }));
    project(sectionKey, entry.versions[clamped]);
  },

  // Approving locks the section (status flip is done by approveBlueprintSection)
  // and DELETES its client-side drafts — the approved content lives in the DB.
  // The blueprint already holds the viewed version, so nothing is re-projected.
  approveSection: (sectionKey) => {
    const { activeProjectId, byProject } = get();
    if (!byProject[activeProjectId]?.[sectionKey]) return false;
    set((state) => {
      const forProject = { ...(state.byProject[activeProjectId] || {}) };
      delete forProject[sectionKey];
      return { byProject: { ...state.byProject, [activeProjectId]: forProject } };
    });
    return true;
  },

  // Reconcile on open: approved sections come from the DB (no client draft
  // retained); unapproved local drafts are restored and overlaid.
  loadProject: (projectId, dbSectionRows = []) => {
    const merged = { ...(get().byProject[projectId] || {}) };
    for (const row of dbSectionRows || []) {
      if (row.status === 'approved' && (row.content || '').trim()) {
        delete merged[row.section_key]; // approved → no client-side draft
        project(row.section_key, versionFromDbRow(row), true);
      }
    }
    set((state) => ({
      activeProjectId: projectId,
      byProject: { ...state.byProject, [projectId]: merged }
    }));
    // Overlay each remaining (unapproved) section's active draft.
    for (const [key, entry] of Object.entries(merged)) {
      project(key, entry.versions[entry.activeIndex]);
    }
  },

  clearProject: (projectId) => set((state) => {
    const byProject = { ...state.byProject };
    delete byProject[projectId];
    return { byProject, activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId };
  }),

  // Stop projecting one project's local drafts without deleting them.
  deactivateProject: () => set({ activeProjectId: null }),

  // Clears the ACTIVE project's history (New Project / reset flows).
  reset: () => set((state) => {
    if (!state.activeProjectId) return {};
    return { byProject: { ...state.byProject, [state.activeProjectId]: {} } };
  })
}), {
  name: 'mass-section-history-v1',
  version: 1,
  storage: createJSONStorage(getBrowserStorage),
  partialize: ({ byProject }) => ({ byProject })
}));
