import { api } from './apiClient';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore, MEMORY_CATEGORIES } from '../store/projectMemoryStore';
import { useSectionHistoryStore } from '../store/sectionHistoryStore';
import { useAuthStore } from '../store/useAuthStore';
import { cloneSerializable } from '../store/persistence';
import { createBlueprintSchema } from './blueprintSchema';
import { useProjectResourceStore, PROJECT_RESOURCES } from '../store/useProjectResourceStore';
if (import.meta.hot) import.meta.hot.decline();

const SYNC_DEBOUNCE_MS = 1500;

let timer = null;
let unsubscribers = [];
let suspended = false;
let inFlight = null;
let cursor = null;
let resourceEpoch = 0;
const pendingResources = new Map();

const sectionFingerprint = (section = {}) => JSON.stringify({
  content: section.content || '',
  status: section.status || 'pending',
  generationSource: section.generationSource || null,
  generatedBy: section.generatedBy || null,
  validationScores: section.validationScores || null,
  generatedAt: section.generatedAt || null,
  failureReason: section.failureReason || null
});

const metaFingerprint = (project) => JSON.stringify({
  name: project?.name || 'Untitled Project'
});

const memoryFingerprints = (memory = {}) => Object.fromEntries(
  MEMORY_CATEGORIES.map(category => [
    category,
    Object.fromEntries(
      Object.entries(memory[category] || {}).map(([key, value]) => [key, JSON.stringify(value ?? null)])
    )
  ])
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
    memoryByKey: memoryFingerprints(memory),
    metaJSON: metaFingerprint(project)
  };
};

export const pushNow = async () => {
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
  const tasks = [];
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

  const changedMemoryEntries = MEMORY_CATEGORIES.flatMap(category =>
    Object.entries(memory[category] || {})
      .filter(([key]) => next.memoryByKey[category]?.[key] !== cursor.memoryByKey[category]?.[key])
      .map(([key, value]) => ({ category, key, value }))
  );
  if (changedMemoryEntries.length > 0) {
    tasks.push({
      name: 'memory',
      run: () => api.upsertMemory(activeCloudId, { entries: changedMemoryEntries }),
      commit: () => {
        changedMemoryEntries.forEach(({ category, key }) => {
          cursor.memoryByKey[category][key] = next.memoryByKey[category][key];
        });
      }
    });
  }

  if (next.metaJSON !== cursor.metaJSON) {
    tasks.push({
      name: 'meta',
      run: () => api.updateProjectMeta(activeCloudId, {
        name: project?.name || 'Untitled Project'
      }),
      commit: () => { cursor.metaJSON = next.metaJSON; }
    });
  }

  if (tasks.length === 0) return true;

  const results = await Promise.allSettled(tasks.map(t => t.run()));
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
  unsubscribeAll();
  unsubscribers = [useProjectStore, useProjectMemoryStore]
    .map(store => store.subscribe(scheduleSync));
};

export const stopSync = () => {
  unsubscribeAll();
  cursor = null;
  resetProjectResourceLoading();
};

export const resetProjectResourceLoading = (projectId = null, status = 'idle') => {
  resourceEpoch += 1;
  pendingResources.clear();
  useProjectResourceStore.getState().resetForProject(projectId, status);
};
export const createCloudProject = async (form) => {
  const { session, setActiveCloudId, addCloudProject } = useAuthStore.getState();
  if (!session) return null;
  try {
    const row = await api.createProject(form);
    addCloudProject(row);
    setActiveCloudId(row.id);
    useSectionHistoryStore.getState().loadProject(row.id, []);
    useProjectStore.getState().setProject({ ...form, id: row.id });
    cursor = snapshotCursor();
    resetProjectResourceLoading(row.id, 'ready');
    return row.id;
  } catch (err) {
    console.error('[Cloud] Failed to create project row:', err.message);
    return null;
  }
};

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
export const openCloudProject = async (id) => {
  const registryProject = useAuthStore.getState().cloudProjects.find(project => project.id === id);
  if (!registryProject) {
    console.error('[Cloud] Cannot open a project that is not in the registry.');
    return false;
  }

  await flush();

  let data;
  try {
    data = await api.getProjectBlueprint(id);
  } catch (err) {
    console.error('[Cloud] Failed to open project:', err.message);
    return false;
  }
  suspended = true;
  try {
    const projectStore = useProjectStore.getState();
    projectStore.clearForProjectSelection(
      { id, name: registryProject.name },
      buildBlueprint(data.sections)
    );
    useProjectMemoryStore.getState().clearMemory();
    useSectionHistoryStore.getState().loadProject(id, data.sections);
  } finally {
    suspended = false;
  }
  useAuthStore.getState().setActiveCloudId(id);
  cursor = snapshotCursor();
  resetProjectResourceLoading(id);
  return true;
};

const normalizeListPayload = (payload, key) => Array.isArray(payload) ? payload : (payload?.[key] || []);

const mergeAppendOnly = (databaseRows, localRows) => {
  const databaseIds = new Set(databaseRows.map(row => String(row?.id ?? '')));
  return [
    ...databaseRows,
    ...localRows.filter(row => !databaseIds.has(String(row?.id ?? '')))
  ];
};

const buildMemory = (entries) => {
  const hydrated = Object.fromEntries(MEMORY_CATEGORIES.map(category => [category, {}]));
  entries.forEach(entry => {
    if (MEMORY_CATEGORIES.includes(entry?.category) && typeof entry?.key === 'string') {
      hydrated[entry.category][entry.key] = entry.value;
    }
  });
  return hydrated;
};

const applyHydratedResource = (resource, payload) => {
  suspended = true;
  try {
    if (resource === 'meta') {
      const currentProject = useProjectStore.getState().project || {};
      const metaWasLocallyChanged = cursor && metaFingerprint(currentProject) !== cursor.metaJSON;
      const databaseProject = { ...currentProject, ...(payload || {}), id: currentProject.id };
      useProjectStore.setState({
        project: {
          ...databaseProject,
          ...(metaWasLocallyChanged ? { name: currentProject.name } : {}),
        }
      });
      if (cursor) cursor.metaJSON = metaFingerprint(databaseProject);
      return;
    }

    if (resource === 'events') {
      const databaseEvents = normalizeListPayload(payload, 'events');
      const localEvents = useProjectStore.getState().workflowEvents.slice(cursor?.eventCount || 0);
      useProjectStore.setState({ workflowEvents: mergeAppendOnly(databaseEvents, localEvents) });
      if (cursor) cursor.eventCount = databaseEvents.length;
      return;
    }

    if (resource === 'memory') {
      const databaseMemory = buildMemory(normalizeListPayload(payload, 'entries'));
      const currentMemory = useProjectMemoryStore.getState().memory;
      const currentFingerprints = memoryFingerprints(currentMemory);
      const locallyChangedEntries = cursor
        ? MEMORY_CATEGORIES.flatMap(category =>
            Object.entries(currentMemory[category] || {})
              .filter(([key]) => currentFingerprints[category]?.[key] !== cursor.memoryByKey[category]?.[key])
              .map(([key, value]) => ({ category, key, value }))
          )
        : [];
      const mergedMemory = {
        ...databaseMemory,
        ...Object.fromEntries(MEMORY_CATEGORIES.map(category => [
          category,
          { ...(databaseMemory[category] || {}) }
        ]))
      };
      locallyChangedEntries.forEach(({ category, key, value }) => {
        mergedMemory[category][key] = value;
      });
      useProjectMemoryStore.setState({ memory: mergedMemory });
      if (cursor) {
        cursor.memoryByKey = memoryFingerprints(databaseMemory);
      }
      return;
    }

    if (resource === 'decisions') {
      const databaseDecisions = normalizeListPayload(payload, 'decisions');
      const localDecisions = useProjectMemoryStore.getState().decisionHistory.slice(cursor?.decisionCount || 0);
      useProjectMemoryStore.setState({
        decisionHistory: mergeAppendOnly(databaseDecisions, localDecisions)
      });
      if (cursor) cursor.decisionCount = databaseDecisions.length;
    }
  } finally {
    suspended = false;
  }
};

const RESOURCE_LOADERS = {
  meta: id => api.getProjectMeta(id),
  events: id => api.getProjectEvents(id),
  memory: id => api.getProjectMemory(id),
  decisions: id => api.getProjectDecisions(id)
};

const ensureOneResource = (projectId, resource, epoch) => {
  const key = `${projectId}:${resource}`;
  const existing = pendingResources.get(key);
  if (existing) return existing;

  const state = useProjectResourceStore.getState();
  if (state.projectId === projectId && state.resources[resource]?.status === 'ready') {
    return Promise.resolve();
  }

  state.setResourceState(projectId, resource, 'loading');
  const request = RESOURCE_LOADERS[resource](projectId)
    .then(payload => {
      const isCurrent = epoch === resourceEpoch
        && useAuthStore.getState().activeCloudId === projectId
        && useProjectResourceStore.getState().projectId === projectId;
      if (!isCurrent) return;
      applyHydratedResource(resource, payload);
      useProjectResourceStore.getState().setResourceState(projectId, resource, 'ready');
    })
    .catch(error => {
      const isCurrent = epoch === resourceEpoch
        && useAuthStore.getState().activeCloudId === projectId
        && useProjectResourceStore.getState().projectId === projectId;
      if (isCurrent) {
        useProjectResourceStore.getState().setResourceState(
          projectId,
          resource,
          'error',
          error?.message || `Could not load ${resource}.`
        );
      }
      throw error;
    })
    .finally(() => {
      if (pendingResources.get(key) === request) pendingResources.delete(key);
    });
  pendingResources.set(key, request);
  return request;
};
export const ensureProjectResources = async (resourceNames) => {
  const projectId = useAuthStore.getState().activeCloudId;
  if (!projectId) throw new Error('Open a project before loading its data.');
  const resources = [...new Set(resourceNames)].filter(name => PROJECT_RESOURCES.includes(name));
  const epoch = resourceEpoch;
  const results = await Promise.allSettled(resources.map(resource => ensureOneResource(projectId, resource, epoch)));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  if (epoch !== resourceEpoch || useAuthStore.getState().activeCloudId !== projectId) {
    throw new Error('The active project changed while its data was loading.');
  }
};
