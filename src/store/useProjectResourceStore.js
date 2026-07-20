import { create } from 'zustand';

export const PROJECT_RESOURCES = ['meta', 'events', 'memory', 'decisions'];

const createResourceState = (status = 'idle') => Object.fromEntries(
  PROJECT_RESOURCES.map(resource => [resource, { status, error: null }])
);

// Tracks database hydration for only the currently open project. The actual
// project data remains in its domain store; this store owns loading UI/state.
export const useProjectResourceStore = create((set) => ({
  projectId: null,
  resources: createResourceState(),

  resetForProject: (projectId, status = 'idle') => set({
    projectId,
    resources: createResourceState(status)
  }),

  setResourceState: (projectId, resource, status, error = null) => set((state) => {
    if (state.projectId !== projectId || !PROJECT_RESOURCES.includes(resource)) return state;
    return {
      resources: {
        ...state.resources,
        [resource]: { status, error }
      }
    };
  })
}));

