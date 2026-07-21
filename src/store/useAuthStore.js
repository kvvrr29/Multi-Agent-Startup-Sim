import { create } from 'zustand';
import { api } from '../services/apiClient';

/**
 * Auth + cloud project registry (Mocked for Development).
 */
export const useAuthStore = create((set, get) => ({
  session: undefined,
  user: null,
  cloudProjects: [],
  activeCloudId: null,
  authMessage: null,
  authError: null,

  init: () => {
    const saved = localStorage.getItem('dev_session');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        set({ session: { user }, user });
      } catch (e) {
        set({ session: null, user: null });
      }
    } else {
      set({ session: null, user: null });
    }
  },

  signInWithEmail: async (email, name) => {
    set({ authMessage: null, authError: null });
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      set({ authError: 'Please enter a valid email address.' });
      return false;
    }
    if (!name || name.trim().length === 0) {
      set({ authError: 'Please enter your name.' });
      return false;
    }

    const user = { email, name: name.trim() };
    localStorage.setItem('dev_session', JSON.stringify(user));
    set({ session: { user }, user });
    return true;
  },

  signOut: async () => {
    localStorage.removeItem('dev_session');
    set({ session: null, user: null, cloudProjects: [], activeCloudId: null, authMessage: null, authError: null });
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
