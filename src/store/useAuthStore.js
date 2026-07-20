import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';
import { api } from '../services/apiClient';
import { useSectionHistoryStore } from './sectionHistoryStore';

/**
 * Auth + cloud project registry.
 * session: undefined = still loading, null = signed out, object = signed in.
 * activeCloudId: the projects-table row the local stores currently sync into.
 */
export const useAuthStore = create((set, get) => ({
  session: undefined,
  user: null,
  cloudProjects: [],
  projectsHasMore: false,
  projectsNextOffset: 0,
  projectsLoadingMore: false,
  activeCloudId: null,
  authMessage: null,
  authError: null,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session ?? null, user: data.session?.user || null });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session: session ?? null, user: session?.user || null });
      if (!session) set({
        cloudProjects: [],
        projectsHasMore: false,
        projectsNextOffset: 0,
        projectsLoadingMore: false,
        activeCloudId: null
      });
    });
  },

  signInWithEmail: async (email) => {
    set({ authMessage: null, authError: null });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) {
      set({ authError: error.message });
      return false;
    }
    set({ authMessage: `Magic link sent to ${email}. Open it in this browser to sign in.` });
    return true;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({
      cloudProjects: [],
      projectsHasMore: false,
      projectsNextOffset: 0,
      projectsLoadingMore: false,
      activeCloudId: null,
      authMessage: null,
      authError: null
    });
  },

  setActiveCloudId: (id) => set({ activeCloudId: id }),
  detachCloud: () => set({ activeCloudId: null }),
  addCloudProject: (project) => set((state) => ({
    cloudProjects: [project, ...state.cloudProjects.filter(p => p.id !== project.id)],
    projectsNextOffset: state.projectsHasMore ? state.projectsNextOffset + 1 : state.projectsNextOffset
  })),

  // Returns the project list, or null when the API is unreachable — callers
  // must not treat a failure as "the user has no projects".
  refreshProjects: async () => {
    if (!get().session) return [];
    try {
      const payload = await api.listProjects();
      const projects = Array.isArray(payload) ? payload : (payload?.projects || []);
      set({
        cloudProjects: projects,
        projectsHasMore: payload?.pagination?.hasMore === true,
        projectsNextOffset: payload?.pagination?.nextOffset ?? projects.length,
        projectsLoadingMore: false
      });
      return projects;
    } catch (err) {
      console.error('[Cloud] Failed to list projects:', err.message);
      return null;
    }
  },

  loadMoreProjects: async () => {
    const state = get();
    if (!state.session || !state.projectsHasMore || state.projectsLoadingMore) return false;
    set({ projectsLoadingMore: true });
    try {
      const payload = await api.listProjects({ offset: state.projectsNextOffset });
      const projects = Array.isArray(payload) ? payload : (payload?.projects || []);
      set((current) => ({
        cloudProjects: [
          ...current.cloudProjects,
          ...projects.filter(project => !current.cloudProjects.some(existing => existing.id === project.id))
        ],
        projectsHasMore: payload?.pagination?.hasMore === true,
        projectsNextOffset: payload?.pagination?.nextOffset ?? state.projectsNextOffset + projects.length,
        projectsLoadingMore: false
      }));
      return true;
    } catch (err) {
      console.error('[Cloud] Failed to load more projects:', err.message);
      set({ projectsLoadingMore: false });
      return false;
    }
  },

  deleteCloudProject: async (id) => {
    try {
      await api.deleteProject(id);
    } catch (err) {
      console.error('[Cloud] Failed to delete project:', err.message);
      return false;
    }
    useSectionHistoryStore.getState().clearProject(id);
    set((state) => ({
      cloudProjects: state.cloudProjects.filter(p => p.id !== id),
      projectsNextOffset: state.projectsHasMore
        ? Math.max(0, state.projectsNextOffset - 1)
        : state.projectsNextOffset,
      activeCloudId: state.activeCloudId === id ? null : state.activeCloudId
    }));
    return true;
  }
}));
