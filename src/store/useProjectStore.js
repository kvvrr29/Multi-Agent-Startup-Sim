import { create } from 'zustand';
import { createBlueprintSchema } from '../services/blueprintSchema';
const AGENT_ROLE_LABELS = {
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
const BUSY_STATUSES = [
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
  mediator: { id: 'mediator', name: 'Alex', role: AGENT_ROLE_LABELS.MEDIATOR, status: AGENT_STATUS.IDLE, currentTask: null },
  ceo: { id: 'ceo', name: 'Sarah', role: AGENT_ROLE_LABELS.CEO, status: AGENT_STATUS.IDLE, currentTask: null },
  pm: { id: 'pm', name: 'David', role: AGENT_ROLE_LABELS.PM, status: AGENT_STATUS.IDLE, currentTask: null },
  developer: { id: 'developer', name: 'Elena', role: AGENT_ROLE_LABELS.DEVELOPER, status: AGENT_STATUS.IDLE, currentTask: null },
  marketing: { id: 'marketing', name: 'Marcus', role: AGENT_ROLE_LABELS.MARKETING, status: AGENT_STATUS.IDLE, currentTask: null },
};

const createInitialAgents = () => Object.fromEntries(
  Object.entries(initialAgents).map(([key, value]) => [key, { ...value }])
);
export const useProjectStore = create((set, get) => ({
  currentView: 'create', // 'create', 'dashboard'
  project: null,
  agents: createInitialAgents(),
  blueprint: createBlueprintSchema(),
  workflowEvents: [],
  deferredDataState: 'unloaded',
  activeRevision: null,
  recentRevisionResult: null,
  workflow: { active: false, runId: null, kind: null, startedAt: null },
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
  
  setProject: (projectData) => set({ project: projectData, currentView: 'dashboard', deferredDataState: 'local' }),

  clearForProjectSelection: (projectData, blueprint) => set({
    currentView: 'dashboard',
    project: projectData,
    agents: createInitialAgents(),
    blueprint,
    workflowEvents: [],
    activeRevision: null,
    recentRevisionResult: null,
    workflow: { active: false, runId: null, kind: null, startedAt: null },
    deferredDataState: 'unloaded'
  }),

  clearActiveProject: (currentView = 'dashboard') => set({
    currentView,
    project: null,
    agents: createInitialAgents(),
    blueprint: createBlueprintSchema(),
    workflowEvents: [],
    activeRevision: null,
    recentRevisionResult: null,
    workflow: { active: false, runId: null, kind: null, startedAt: null },
    deferredDataState: 'unloaded'
  }),
  
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

  updateBlueprintSection: (sectionKey, content, status = 'pending', metadata = {}) => set((state) => ({
    blueprint: {
      ...state.blueprint,
      [sectionKey]: {
        ...state.blueprint[sectionKey],
        content,
        status,
        ...metadata
      }
    }
  })),

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
    workflow: { active: false, runId: null, kind: null, startedAt: null },
    deferredDataState: 'unloaded'
  })
}));
