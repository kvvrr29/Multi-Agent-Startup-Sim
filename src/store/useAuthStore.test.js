import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn()
    }
  }
}));

vi.mock('../services/apiClient', () => ({
  api: {
    listProjects: vi.fn(),
    deleteProject: vi.fn()
  }
}));

import { api } from '../services/apiClient';
import { useAuthStore } from './useAuthStore';

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    session: { user: { id: 'user-1' } },
    cloudProjects: [],
    projectsHasMore: false,
    projectsNextOffset: 0,
    projectsLoadingMore: false,
    activeCloudId: null
  });
});

describe('paginated project registry', () => {
  it('loads the first page and records the next offset', async () => {
    api.listProjects.mockResolvedValue({
      projects: [{ id: 'p1', name: 'First' }],
      pagination: { hasMore: true, nextOffset: 50 }
    });

    const projects = await useAuthStore.getState().refreshProjects();

    expect(projects.map(project => project.id)).toEqual(['p1']);
    expect(useAuthStore.getState()).toMatchObject({
      projectsHasMore: true,
      projectsNextOffset: 50,
      projectsLoadingMore: false
    });
  });

  it('appends and deduplicates the next page', async () => {
    useAuthStore.setState({
      cloudProjects: [{ id: 'p1', name: 'First' }],
      projectsHasMore: true,
      projectsNextOffset: 50
    });
    api.listProjects.mockResolvedValue({
      projects: [{ id: 'p1', name: 'Duplicate' }, { id: 'p2', name: 'Second' }],
      pagination: { hasMore: false, nextOffset: null }
    });

    const loaded = await useAuthStore.getState().loadMoreProjects();

    expect(loaded).toBe(true);
    expect(api.listProjects).toHaveBeenCalledWith({ offset: 50 });
    expect(useAuthStore.getState().cloudProjects.map(project => project.id)).toEqual(['p1', 'p2']);
    expect(useAuthStore.getState().projectsHasMore).toBe(false);
  });
});
