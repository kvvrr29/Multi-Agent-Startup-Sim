import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';
import { api } from '../services/apiClient';

/**
 * Auth + cloud project registry.
 * session: undefined = still loading, null = signed out, object = signed in.
 * activeCloudId: the projects-table row the local stores currently sync into.
 */
export const useAuthStore = create((set, get) => ({
  session: undefined,
  user: null,
  cloudProjects: [],
  activeCloudId: null,
  authMessage: null,
  authError: null,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session ?? null, user: data.session?.user || null });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session: session ?? null, user: session?.user || null });
      if (!session) set({ cloudProjects: [], activeCloudId: null });
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
    set({ cloudProjects: [], activeCloudId: null, authMessage: null, authError: null });
  },

  setActiveCloudId: (id) => set({ activeCloudId: id }),
  detachCloud: () => set({ activeCloudId: null }),

  // Returns the project list, or null when the API is unreachable — callers
  // must not treat a failure as "the user has no projects".
  refreshProjects: async () => {
    if (!get().session) return [];
    try {
      const data = await api.listProjects();
      set({ cloudProjects: data || [] });
      return data || [];
    } catch (err) {
      console.error('[Cloud] Failed to list projects:', err.message);
      return null;
    }
  },

  deleteCloudProject: async (id) => {
    try {
      await api.deleteProject(id);
    } catch (err) {
      console.error('[Cloud] Failed to delete project:', err.message);
      return false;
    }
    set((state) => ({
      cloudProjects: state.cloudProjects.filter(p => p.id !== id),
      activeCloudId: state.activeCloudId === id ? null : state.activeCloudId
    }));
    return true;
  }
}));
