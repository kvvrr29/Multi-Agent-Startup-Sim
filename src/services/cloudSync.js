import { api } from './apiClient';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { useVersionStore } from '../store/versionStore';
import { useAuthStore } from '../store/useAuthStore';
import { cloneSerializable } from '../store/persistence';

const SYNC_DEBOUNCE_MS = 1500;

let timer = null;
let unsubscribers = [];
// Hydration writes into the stores; suspend prevents echoing those writes back up.
let suspended = false;

const collectState = () => {
  const { project, blueprint, workflowEvents, currentView } = useProjectStore.getState();
  const { versions, currentVersionId } = useVersionStore.getState();
  return {
    name: project?.name || 'Untitled Project',
    project_state: cloneSerializable({ project, blueprint, workflowEvents, currentView }),
    memory_state: useProjectMemoryStore.getState().getSnapshot(),
    version_state: cloneSerializable({ versions, currentVersionId })
  };
};

export const pushNow = async () => {
  const { activeCloudId, session } = useAuthStore.getState();
  if (!activeCloudId || !session || suspended) return false;
  try {
    await api.updateProject(activeCloudId, collectState());
    return true;
  } catch (err) {
    console.error('[Cloud] Sync failed:', err.message);
    return false;
  }
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
};

/** Register a new project on the server and make it the sync target. */
export const createCloudProject = async (name) => {
  const { session, setActiveCloudId } = useAuthStore.getState();
  if (!session) return null;
  try {
    const row = await api.createProject(name);
    setActiveCloudId(row.id);
    return row.id;
  } catch (err) {
    console.error('[Cloud] Failed to create project row:', err.message);
    return null;
  }
};

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
    const projectState = data.project_state || {};
    const projectStore = useProjectStore.getState();
    projectStore.setBlueprint(projectState.blueprint || {});
    useProjectStore.setState({
      project: projectState.project || null,
      workflowEvents: projectState.workflowEvents || [],
      currentView: projectState.project ? 'dashboard' : 'create'
    });
    projectStore.resetAllAgents();
    useProjectMemoryStore.getState().restoreSnapshot(data.memory_state || {});
    useVersionStore.setState({
      versions: data.version_state?.versions || [],
      currentVersionId: data.version_state?.currentVersionId || null
    });
  } finally {
    suspended = false;
  }
  useAuthStore.getState().setActiveCloudId(id);
  return true;
};
