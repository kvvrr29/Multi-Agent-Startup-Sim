import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createBlueprintSchema } from '../services/blueprintSchema';
import { getBrowserStorage } from './persistence';

export const AGENT_ROLES = {
  MEDIATOR: 'Mediator',
  CEO: 'CEO',
  PM: 'Product Manager',
  DEVELOPER: 'Developer',
  MARKETING: 'Marketing',
};

export const AGENT_STATUS = {
  IDLE: 'Idle',
  ANALYZING: 'Analyzing',
  ROUTING: 'Routing',
  WAITING: 'Waiting For Agent',
  ASSIGNED: 'Assigned',
  THINKING: 'Thinking',
  WORKING: 'Working',
  REVIEWING: 'Reviewing',
  UPDATING: 'Updating Blueprint',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

// Statuses in which an agent is actively occupied. Completed/Failed/Idle are
// terminal states — they must never block new work (doc §5: no stuck agents).
export const BUSY_STATUSES = [
  AGENT_STATUS.ANALYZING,
  AGENT_STATUS.ROUTING,
  AGENT_STATUS.WAITING,
  AGENT_STATUS.ASSIGNED,
  AGENT_STATUS.THINKING,
  AGENT_STATUS.WORKING,
  AGENT_STATUS.REVIEWING,
  AGENT_STATUS.UPDATING,
];

export const isAgentBusy = (agent) => BUSY_STATUSES.includes(agent?.status);

const initialAgents = {
  mediator: { id: 'mediator', name: 'Alex', role: AGENT_ROLES.MEDIATOR, status: AGENT_STATUS.IDLE, currentTask: null },
  ceo: { id: 'ceo', name: 'Sarah', role: AGENT_ROLES.CEO, status: AGENT_STATUS.IDLE, currentTask: null },
  pm: { id: 'pm', name: 'David', role: AGENT_ROLES.PM, status: AGENT_STATUS.IDLE, currentTask: null },
  developer: { id: 'developer', name: 'Elena', role: AGENT_ROLES.DEVELOPER, status: AGENT_STATUS.IDLE, currentTask: null },
  marketing: { id: 'marketing', name: 'Marcus', role: AGENT_ROLES.MARKETING, status: AGENT_STATUS.IDLE, currentTask: null },
};

const createInitialAgents = () => Object.fromEntries(
  Object.entries(initialAgents).map(([key, value]) => [key, { ...value }])
);

export const useProjectStore = create(persist((set, get) => ({
  // App State
  currentView: 'create', // 'create', 'dashboard'

  // Project Data
  project: null,
  
  // Agents State
  agents: createInitialAgents(),
  
  // Blueprint Data
  blueprint: createBlueprintSchema(),
  
  // Workflow Timeline
  workflowEvents: [],

  // Active Revision State
  activeRevision: null,
  recentRevisionResult: null,
  workflow: { active: false, runId: null, kind: null, startedAt: null },

  // Actions
  setCurrentView: (view) => set({ currentView: view }),

  beginWorkflow: (kind) => {
    if (get().workflow.active) return null;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set({ workflow: { active: true, runId, kind, startedAt: new Date().toISOString() } });
    return runId;
  },
  isCurrentWorkflow: (runId) => get().workflow.active && get().workflow.runId === runId,
  endWorkflow: (runId) => {
    if (get().workflow.runId !== runId) return false;
    set({ workflow: { active: false, runId: null, kind: null, startedAt: null } });
    return true;
  },
  
  setActiveRevision: (data) => set({ activeRevision: data }),
  setRecentRevisionResult: (data) => set({ recentRevisionResult: data }),
  clearRevisionState: () => set({ activeRevision: null, recentRevisionResult: null }),
  
  resetAllAgents: () => set((state) => {
    const resetAgents = {};
    Object.keys(state.agents).forEach(k => {
      resetAgents[k] = { ...state.agents[k], status: AGENT_STATUS.IDLE, currentTask: null, reason: null };
    });
    return { agents: resetAgents, activeRevision: null };
  }),
  
  setProject: (projectData) => set({ project: projectData, currentView: 'dashboard' }),
  
  updateAgentStatus: (agentId, status, currentTask = null, reason = null) => set((state) => ({
    agents: {
      ...state.agents,
      [agentId]: {
        ...state.agents[agentId],
        status,
        currentTask: currentTask !== null ? currentTask : state.agents[agentId].currentTask,
        reason: reason !== null ? reason : (status === AGENT_STATUS.IDLE ? null : state.agents[agentId].reason)
      }
    }
  })),

  updateBlueprintSection: (sectionKey, content, status = 'pending', confidence = 'High', lastModifiedVersion = 'v1', metadata = {}) => set((state) => ({
    blueprint: {
      ...state.blueprint,
      [sectionKey]: { 
        ...state.blueprint[sectionKey], 
        content, 
        status, 
        confidence,
        lastModifiedVersion,
        ...metadata
      }
    }
  })),

  // Full-blueprint replacement used by version restore (doc §14): restores
  // content AND approval state, and clears sections absent from the snapshot.
  setBlueprint: (blueprint) => set(() => {
    const restored = createBlueprintSchema();
    Object.keys(blueprint || {}).forEach(key => {
      if (restored[key]) {
        restored[key] = { ...restored[key], ...blueprint[key] };
      }
    });
    return { blueprint: restored };
  }),

  approveBlueprintSection: (sectionKey, runId = null) => {
    if ((get().workflow.active && get().workflow.runId !== runId) || !get().blueprint[sectionKey]) return false;
    set((state) => ({ blueprint: {
      ...state.blueprint,
      [sectionKey]: { ...state.blueprint[sectionKey], status: 'approved' }
    }}));
    return true;
  },

  addWorkflowEvent: (event) => set((state) => ({
    workflowEvents: [...state.workflowEvents, { id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9), timestamp: new Date(), ...event }]
  })),

  reset: () => set({
    currentView: 'create',
    project: null,
    agents: createInitialAgents(),
    blueprint: createBlueprintSchema(),
    workflowEvents: [],
    activeRevision: null,
    recentRevisionResult: null,
    workflow: { active: false, runId: null, kind: null, startedAt: null }
  })
}), {
  name: 'mass-project-v2',
  version: 2,
  storage: createJSONStorage(getBrowserStorage),
  partialize: ({ currentView, project, blueprint, workflowEvents }) => ({ currentView, project, blueprint, workflowEvents }),
  migrate: (persisted = {}) => ({
    ...persisted,
    currentView: persisted.project ? 'dashboard' : 'create',
    blueprint: { ...createBlueprintSchema(), ...(persisted.blueprint || {}) }
  }),
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    state.resetAllAgents();
    state.endWorkflow(state.workflow?.runId);
  }
}));
