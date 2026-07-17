import { supabase } from './supabaseClient';

/**
 * All backend traffic goes through the Express server under /api.
 * supabase-js is used in the browser ONLY for the auth handshake (magic link
 * + session); its access token authenticates every API request here.
 */
const request = async (path, { method = 'GET', body } = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw Object.assign(new Error('Not signed in.'), { status: 401 });
  }
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
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
};

export const api = {
  listProjects: () => request('/api/projects'),
  createProject: (name) => request('/api/projects', { method: 'POST', body: { name } }),
  getProject: (id) => request(`/api/projects/${id}`),
  updateProject: (id, patch) => request(`/api/projects/${id}`, { method: 'PUT', body: patch }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  generate: (systemPrompt, userPrompt, jsonSchema) =>
    request('/api/ai/generate', { method: 'POST', body: { systemPrompt, userPrompt, jsonSchema } })
};
