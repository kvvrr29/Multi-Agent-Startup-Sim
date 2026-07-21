import { StorageProvider } from './storage/StorageProvider';

// The AI endpoints still bypass the StorageProvider since they are stateless 
// proxies that don't depend on the database choice.
const fetchJson = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  if (res.status === 204) return null;
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error(payload.message || `API returned ${res.status}`),
      { status: res.status, code: payload.error }
    );
  }
  return payload;
};

export const api = {
  listProjects: () => StorageProvider.listProjects(),
  createProject: (form) => StorageProvider.createProject(form),
  getProject: (id) => StorageProvider.getProject(id),
  updateProjectMeta: (id, patch) => StorageProvider.updateProjectMeta(id, patch),
  upsertSections: (id, sections) => StorageProvider.upsertSections(id, sections),
  appendEvents: (id, events) => StorageProvider.appendEvents(id, events),
  createVersion: (id, version) => StorageProvider.createVersion(id, version),
  upsertMemory: (id, body) => StorageProvider.upsertMemory(id, body),
  appendDecisions: (id, decisions) => StorageProvider.appendDecisions(id, decisions),
  deleteProject: (id) => StorageProvider.deleteProject(id)
};
