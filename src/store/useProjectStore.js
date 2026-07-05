import { create } from 'zustand';
import { createBlueprintSchema } from '../services/blueprintSchema';

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
  UPDATING: 'Updating Blueprint',
  COMPLETED: 'Completed',
};

const initialAgents = {
  mediator: { id: 'mediator', name: 'Alex', role: AGENT_ROLES.MEDIATOR, status: AGENT_STATUS.IDLE, currentTask: null },
  ceo: { id: 'ceo', name: 'Sarah', role: AGENT_ROLES.CEO, status: AGENT_STATUS.IDLE, currentTask: null },
  pm: { id: 'pm', name: 'David', role: AGENT_ROLES.PM, status: AGENT_STATUS.IDLE, currentTask: null },
  developer: { id: 'developer', name: 'Elena', role: AGENT_ROLES.DEVELOPER, status: AGENT_STATUS.IDLE, currentTask: null },
  marketing: { id: 'marketing', name: 'Marcus', role: AGENT_ROLES.MARKETING, status: AGENT_STATUS.IDLE, currentTask: null },
};

const initialBlueprint = createBlueprintSchema();

export const useProjectStore = create((set) => ({
  // App State
  currentView: 'create', // 'create', 'dashboard'

  // Project Data
  project: null,
  
  // Agents State
  agents: initialAgents,
  
  // Blueprint Data
  blueprint: initialBlueprint,
  
  // Workflow Timeline
  workflowEvents: [],

  // Active Revision State
  activeRevision: null,
  recentRevisionResult: null,

  // Actions
  setCurrentView: (view) => set({ currentView: view }),
  
  setActiveRevision: (data) => set({ activeRevision: data }),
  setRecentRevisionResult: (data) => set({ recentRevisionResult: data }),
  clearRevisionState: () => set({ activeRevision: null, recentRevisionResult: null }),
  
  resetAllAgents: () => set((state) => {
    const resetAgents = {};
    Object.keys(state.agents).forEach(k => {
      resetAgents[k] = { ...state.agents[k], status: AGENT_STATUS.IDLE, currentTask: null };
    });
    return { agents: resetAgents, activeRevision: null };
  }),
  
  setProject: (projectData) => set({ project: projectData, currentView: 'dashboard' }),
  
  updateAgentStatus: (agentId, status, currentTask = null) => set((state) => ({
    agents: {
      ...state.agents,
      [agentId]: { ...state.agents[agentId], status, currentTask: currentTask !== null ? currentTask : state.agents[agentId].currentTask }
    }
  })),

  updateBlueprintSection: (sectionKey, content, status = 'pending', confidence = 'High', lastModifiedVersion = 'v1') => set((state) => ({
    blueprint: {
      ...state.blueprint,
      [sectionKey]: { 
        ...state.blueprint[sectionKey], 
        content, 
        status, 
        confidence,
        lastModifiedVersion
      }
    }
  })),

  approveBlueprintSection: (sectionKey) => set((state) => ({
    blueprint: {
      ...state.blueprint,
      [sectionKey]: { ...state.blueprint[sectionKey], status: 'approved' }
    }
  })),

  addWorkflowEvent: (event) => set((state) => ({
    workflowEvents: [...state.workflowEvents, { id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9), timestamp: new Date(), ...event }]
  })),

  reset: () => set({
    currentView: 'create',
    project: null,
    agents: initialAgents,
    blueprint: initialBlueprint,
    workflowEvents: []
  })
}));
