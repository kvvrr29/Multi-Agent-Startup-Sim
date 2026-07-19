import { api } from './apiClient';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore, createEmptyMemory, MEMORY_CATEGORIES } from '../store/projectMemoryStore';
import { useVersionStore } from '../store/versionStore';
import { useAuthStore } from '../store/useAuthStore';
import { cloneSerializable } from '../store/persistence';
import { createBlueprintSchema } from './blueprintSchema';

const SYNC_DEBOUNCE_MS = 1500;

let timer = null;
let unsubscribers = [];
// Hydration writes into the stores; suspend prevents echoing those writes back up.
let suspended = false;

/**
 * Last-pushed cursor for the open project. pushNow() diffs the stores against
 * this and only sends what changed, instead of the old whole-blob PUT.
 */
let cursor = null;

const sectionFingerprint = (section = {}) => JSON.stringify({
  content: section.content || '',
  status: section.status || 'pending',
  lastModifiedVersion: section.lastModifiedVersion || 'v1',
  generationSource: section.generationSource || null,
  generatedBy: section.generatedBy || null,
  validationScores: section.validationScores || null,
  generatedAt: section.generatedAt || null,
  failureReason: section.failureReason || null
});

const metaFingerprint = (project, memory, currentVersionId) => JSON.stringify({
  name: project?.name || 'Untitled Project',
  domain: memory?.domain || '',
  version: currentVersionId || null
});

const memoryFingerprint = (memory = {}) => JSON.stringify(
  MEMORY_CATEGORIES.map(cat => memory[cat] || {})
);

const snapshotCursor = () => {
  const { project, blueprint, workflowEvents } = useProjectStore.getState();
  const { memory, decisionHistory } = useProjectMemoryStore.getState();
  const { versions, currentVersionId } = useVersionStore.getState();
  return {
    sectionsByKey: Object.fromEntries(
      Object.entries(blueprint || {}).map(([key, section]) => [key, sectionFingerprint(section)])
    ),
    eventCount: workflowEvents.length,
    versionCount: versions.length,
    decisionCount: decisionHistory.length,
    memoryJSON: memoryFingerprint(memory),
    metaJSON: metaFingerprint(project, memory, currentVersionId)
  };
};

export const pushNow = async () => {
  const { activeCloudId, session } = useAuthStore.getState();
  if (!activeCloudId || !session || suspended || !cursor) return false;

  const { project, blueprint, workflowEvents } = useProjectStore.getState();
  const { memory, decisionHistory } = useProjectMemoryStore.getState();
  const { versions, currentVersionId } = useVersionStore.getState();

  const calls = [];
  const next = snapshotCursor();

  const changedSections = Object.entries(blueprint || {})
    .filter(([key]) => next.sectionsByKey[key] !== cursor.sectionsByKey[key])
    .map(([key, section]) => ({
      key,
      content: section.content,
      status: section.status,
      lastModifiedVersion: section.lastModifiedVersion,
      generationSource: section.generationSource,
      generatedBy: section.generatedBy,
      validationScores: section.validationScores,
      generatedAt: section.generatedAt,
      failureReason: section.failureReason
    }));
  if (changedSections.length > 0) calls.push(api.upsertSections(activeCloudId, changedSections));

  const newEvents = workflowEvents.slice(cursor.eventCount);
  if (newEvents.length > 0) calls.push(api.appendEvents(activeCloudId, cloneSerializable(newEvents)));

  const newVersions = versions.slice(cursor.versionCount);
  for (const version of newVersions) calls.push(api.createVersion(activeCloudId, cloneSerializable(version)));

  const newDecisions = decisionHistory.slice(cursor.decisionCount);
  if (newDecisions.length > 0) calls.push(api.appendDecisions(activeCloudId, cloneSerializable(newDecisions)));

  if (next.memoryJSON !== cursor.memoryJSON) {
    const entries = MEMORY_CATEGORIES.flatMap(category =>
      Object.entries(memory[category] || {}).map(([key, value]) => ({ category, key, value }))
    );
    if (entries.length > 0) calls.push(api.upsertMemory(activeCloudId, { entries }));
  }

  if (next.metaJSON !== cursor.metaJSON) {
    calls.push(api.updateProjectMeta(activeCloudId, {
      name: project?.name || 'Untitled Project',
      memoryDomain: memory?.domain || '',
      currentVersionLabel: currentVersionId || ''
    }));
  }

  if (calls.length === 0) return true;
  try {
    await Promise.all(calls);
    cursor = next;
    return true;
  } catch (err) {
    console.error('[Cloud] Sync failed:', err.message);
    return false;
  }
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

export const startSync = () => {
  stopSync();
  unsubscribers = [useProjectStore, useProjectMemoryStore, useVersionStore]
    .map(store => store.subscribe(scheduleSync));
};

export const stopSync = () => {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
  clearTimeout(timer);
  cursor = null;
};

/** Register a new project on the server and make it the sync target. */
export const createCloudProject = async (form) => {
  const { session, setActiveCloudId } = useAuthStore.getState();
  if (!session) return null;
  try {
    const row = await api.createProject(form);
    setActiveCloudId(row.id);
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
      lastModifiedVersion: row.last_modified_version || 'v1',
      generationSource: row.generation_source,
      generatedBy: row.generated_by,
      validationScores: row.validation_scores,
      generatedAt: row.generated_at,
      failureReason: row.failure_reason
    };
  });
  return blueprint;
};

const buildVersions = (versionRows = []) => versionRows.map(row => ({
  id: `v${row.version_number}`,
  timestamp: row.created_at,
  summary: row.summary,
  changeType: row.change_type,
  completionStatus: row.completion_status,
  approvalState: row.approval_state || {},
  affectedAgents: row.affected_agents || [],
  affectedSections: row.affected_sections || [],
  blueprintSnapshot: row.blueprint_snapshot || {},
  memorySnapshot: row.memory_snapshot,
  provenanceSnapshot: row.provenance_snapshot,
  restoredFrom: row.restored_from
}));

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
    useVersionStore.setState({
      versions: buildVersions(data.versions),
      currentVersionId: data.project.current_version_label || null
    });
  } finally {
    suspended = false;
  }
  useAuthStore.getState().setActiveCloudId(id);
  cursor = snapshotCursor();
  return true;
};
