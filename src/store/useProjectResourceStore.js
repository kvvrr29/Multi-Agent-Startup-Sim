import { create } from 'zustand';

export const PROJECT_RESOURCES = ['meta', 'events', 'memory', 'decisions'];

const createResourceState = (status = 'idle') => Object.fromEntries(
  PROJECT_RESOURCES.map(resource => [resource, { status, error: null }])
);
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

