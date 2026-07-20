import { api } from './apiClient';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore, createEmptyMemory, MEMORY_CATEGORIES } from '../store/projectMemoryStore';
import { useSectionHistoryStore } from '../store/sectionHistoryStore';
import { useAuthStore } from '../store/useAuthStore';
import { cloneSerializable } from '../store/persistence';
import { createBlueprintSchema } from './blueprintSchema';

// This module owns long-lived singleton state (store subscriptions + the sync
// cursor). A hot-swap would strand the old subscriptions and leave the new
// module unsubscribed, so edits would silently stop syncing until a full
// reload. Force a full reload on any change to this file instead.
if (import.meta.hot) import.meta.hot.decline();

const SYNC_DEBOUNCE_MS = 1500;

let timer = null;
let unsubscribers = [];
// Hydration writes into the stores; suspend prevents echoing those writes back up.
let suspended = false;
// Serializes pushes so a debounced run and an explicit flush() can't overlap
// and double-advance the cursor.
let inFlight = null;

/**
 * Last-pushed cursor for the open project. pushNow() diffs the stores against
 * this and only sends what changed, instead of the old whole-blob PUT.
 */
let cursor = null;

const sectionFingerprint = (section = {}) => JSON.stringify({
  content: section.content || '',
  status: section.status || 'pending',
  generationSource: section.generationSource || null,
  generatedBy: section.generatedBy || null,
  validationScores: section.validationScores || null,
  generatedAt: section.generatedAt || null,
  failureReason: section.failureReason || null
});

const metaFingerprint = (project, memory) => JSON.stringify({
  name: project?.name || 'Untitled Project',
  domain: memory?.domain || ''
});

const memoryFingerprint = (memory = {}) => JSON.stringify(
  MEMORY_CATEGORIES.map(cat => memory[cat] || {})
);

const snapshotCursor = () => {
  const { project, blueprint, workflowEvents } = useProjectStore.getState();
  const { memory, decisionHistory } = useProjectMemoryStore.getState();
  return {
    sectionsByKey: Object.fromEntries(
      Object.entries(blueprint || {}).map(([key, section]) => [key, sectionFingerprint(section)])
    ),
    eventCount: workflowEvents.length,
    decisionCount: decisionHistory.length,
    memoryJSON: memoryFingerprint(memory),
    metaJSON: metaFingerprint(project, memory)
  };
};

export const pushNow = async () => {
  // Chain onto any in-flight push so cursor commits stay serialized.
  const run = (inFlight || Promise.resolve()).then(doPush);
  inFlight = run.catch(() => {});
  return run;
};

const doPush = async () => {
  const { activeCloudId, session } = useAuthStore.getState();
  if (!activeCloudId || !session || suspended || !cursor) return false;

  const { project, blueprint, workflowEvents } = useProjectStore.getState();
  const { memory, decisionHistory } = useProjectMemoryStore.getState();

  const next = snapshotCursor();

  // Each domain is pushed independently and commits its own slice of the
  // cursor only on success. A failure in one domain must not block the others
  // or wedge the cursor into re-pushing everything forever.
  const tasks = [];

  // Only APPROVED sections are persisted. Unapproved drafts and their version
  // history live entirely client-side (sectionHistoryStore + localStorage) until
  // the user approves, which flips status to 'approved' and lets it through here.
  const changedSections = Object.entries(blueprint || {})
    .filter(([key, section]) => section.status === 'approved' && next.sectionsByKey[key] !== cursor.sectionsByKey[key])
    .map(([key, section]) => ({
      key,
      content: section.content,
      status: section.status,
      generationSource: section.generationSource,
      generatedBy: section.generatedBy,
      validationScores: section.validationScores,
      generatedAt: section.generatedAt,
      failureReason: section.failureReason
    }));
  if (changedSections.length > 0) {
    // Commit only the keys actually pushed, so an unapproved edit stays dirty
    // (unsent) and its later approval still triggers a push.
    tasks.push({ name: 'sections', run: () => api.upsertSections(activeCloudId, changedSections), commit: () => { changedSections.forEach(s => { cursor.sectionsByKey[s.key] = next.sectionsByKey[s.key]; }); } });
  }

  const newEvents = workflowEvents.slice(cursor.eventCount);
  if (newEvents.length > 0) {
    tasks.push({ name: 'events', run: () => api.appendEvents(activeCloudId, cloneSerializable(newEvents)), commit: () => { cursor.eventCount = next.eventCount; } });
  }

  const newDecisions = decisionHistory.slice(cursor.decisionCount);
  if (newDecisions.length > 0) {
    tasks.push({ name: 'decisions', run: () => api.appendDecisions(activeCloudId, cloneSerializable(newDecisions)), commit: () => { cursor.decisionCount = next.decisionCount; } });
  }

  if (next.memoryJSON !== cursor.memoryJSON) {
    const entries = MEMORY_CATEGORIES.flatMap(category =>
      Object.entries(memory[category] || {}).map(([key, value]) => ({ category, key, value }))
    );
    if (entries.length > 0) {
      tasks.push({ name: 'memory', run: () => api.upsertMemory(activeCloudId, { entries }), commit: () => { cursor.memoryJSON = next.memoryJSON; } });
    }
  }

  if (next.metaJSON !== cursor.metaJSON) {
    tasks.push({
      name: 'meta',
      run: () => api.updateProjectMeta(activeCloudId, {
        name: project?.name || 'Untitled Project',
        memoryDomain: memory?.domain || ''
      }),
      commit: () => { cursor.metaJSON = next.metaJSON; }
    });
  }

  if (tasks.length === 0) return true;

  const results = await Promise.allSettled(tasks.map(t => t.run()));
  // The project may have been closed (stopSync) while requests were in flight;
  // its cursor is gone, so there is nothing left to commit against.
  if (!cursor) return false;
  let allOk = true;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      tasks[i].commit?.();
    } else {
      allOk = false;
      console.error(`[Cloud] Sync failed for ${tasks[i].name}:`, result.reason?.message || result.reason);
    }
  });

  return allOk;
};

/** Await any pending changes; used before switching projects and on unload. */
export const flush = () => {
  clearTimeout(timer);
  return pushNow();
};

const scheduleSync = () => {
  if (suspended || !useAuthStore.getState().activeCloudId) return;
  clearTimeout(timer);
  timer = setTimeout(pushNow, SYNC_DEBOUNCE_MS);
};

const unsubscribeAll = () => {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
  clearTimeout(timer);
};

export const startSync = () => {
  // Re-subscribe WITHOUT clearing the cursor: openCloudProject() sets the
  // cursor just before this runs, and nulling it here would make pushNow's
  // `!cursor` guard bail forever — edits to a reopened project would never sync.
  unsubscribeAll();
  unsubscribers = [useProjectStore, useProjectMemoryStore]
    .map(store => store.subscribe(scheduleSync));
};

export const stopSync = () => {
  unsubscribeAll();
  cursor = null;
};

/** Register a new project on the server and make it the sync target. */
export const createCloudProject = async (form) => {
  const { session, setActiveCloudId } = useAuthStore.getState();
  if (!session) return null;
  try {
    const row = await api.createProject(form);
    setActiveCloudId(row.id);
    // Make this the active project for the client-side section history (empty)
    // before the initial simulation starts recording versions.
    useSectionHistoryStore.getState().loadProject(row.id, []);
    cursor = snapshotCursor();
    return row.id;
  } catch (err) {
    console.error('[Cloud] Failed to create project row:', err.message);
    return null;
  }
};

// ---------- Hydration: composed payload rows → store shapes ----------

const buildBlueprint = (sectionRows = []) => {
  const blueprint = createBlueprintSchema();
  sectionRows.forEach(row => {
    if (!blueprint[row.section_key]) return;
    blueprint[row.section_key] = {
      ...blueprint[row.section_key],
      content: row.content || '',
      status: row.status || 'pending',
      generationSource: row.generation_source,
      generatedBy: row.generated_by,
      validationScores: row.validation_scores,
      generatedAt: row.generated_at,
      failureReason: row.failure_reason
    };
  });
  return blueprint;
};

const buildMemory = (memoryRows = [], domain = '') => {
  const memory = createEmptyMemory();
  memory.domain = domain;
  memoryRows.forEach(row => {
    if (!MEMORY_CATEGORIES.includes(row.category)) return;
    memory[row.category] = { ...memory[row.category], [row.key]: row.value };
  });
  if (domain) memory.scope = { ...memory.scope, domain };
  return memory;
};

const buildProjectForm = (row) => ({
  name: row.name,
  idea: row.idea || '',
  targetAudience: row.target_audience || '',
  budget: row.budget || '',
  timeline: row.timeline || '',
  platform: row.platform || 'web',
  teamSize: row.team_size || '',
  priorities: row.priorities || ''
});

/** Load a project from the server and hydrate every store from it. */
export const openCloudProject = async (id) => {
  let data;
  try {
    data = await api.getProject(id);
  } catch (err) {
    console.error('[Cloud] Failed to open project:', err.message);
    return false;
  }
  suspended = true;
  try {
    const projectStore = useProjectStore.getState();
    projectStore.setBlueprint(buildBlueprint(data.sections));
    useProjectStore.setState({
      project: buildProjectForm(data.project),
      workflowEvents: (data.events || []).map(row => cloneSerializable(row.payload)),
      currentView: 'dashboard'
    });
    projectStore.resetAllAgents();
    useProjectMemoryStore.getState().restoreSnapshot({
      memory: buildMemory(data.memory, data.project.memory_domain),
      decisionHistory: (data.decisions || []).map(row => cloneSerializable(row.payload))
    });
    // Reconcile client-side histories: DB wins for approved sections, and local
    // unapproved drafts are restored and overlaid onto the blueprint display.
    useSectionHistoryStore.getState().loadProject(id, data.sections);
  } finally {
    suspended = false;
  }
  useAuthStore.getState().setActiveCloudId(id);
  cursor = snapshotCursor();
  return true;
};
