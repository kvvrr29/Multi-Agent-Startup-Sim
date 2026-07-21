import { supabase } from '../supabaseClient';

/**
 * SupabaseProvider implements the StorageProvider interface using the Express backend
 * and Supabase Auth. This preserves the original architecture.
 */
export class SupabaseProvider {
  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw Object.assign(new Error('Not signed in.'), { status: 401 });
    }
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...headers
      },
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
  }

  listProjects() {
    return this.request('/api/projects');
  }

  createProject(form) {
    return this.request('/api/projects', { method: 'POST', body: form });
  }

  getProject(id) {
    return this.request(`/api/projects/${id}`);
  }

  updateProjectMeta(id, patch) {
    return this.request(`/api/projects/${id}`, { method: 'PATCH', body: patch });
  }

  upsertSections(id, sections) {
    return this.request(`/api/projects/${id}/sections`, { method: 'PUT', body: { sections } });
  }

  appendEvents(id, events) {
    return this.request(`/api/projects/${id}/events`, { method: 'POST', body: { events } });
  }

  createVersion(id, version) {
    return this.request(`/api/projects/${id}/versions`, { method: 'POST', body: version });
  }

  upsertMemory(id, body) {
    return this.request(`/api/projects/${id}/memory`, { method: 'PUT', body });
  }

  appendDecisions(id, decisions) {
    return this.request(`/api/projects/${id}/decisions`, { method: 'POST', body: { decisions } });
  }

  deleteProject(id) {
    return this.request(`/api/projects/${id}`, { method: 'DELETE' });
  }
}
