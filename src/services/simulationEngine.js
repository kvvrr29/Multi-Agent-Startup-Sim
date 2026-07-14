import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { useVersionStore, composeVersionSummary } from '../store/versionStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { generateDynamicBlueprint } from './blueprintFactory';
import { useSettingsStore } from '../store/useSettingsStore';
import { generateAgentContent } from './ai/aiBlueprintFactory';
import { classifyDomain } from './ai/domainClassifier';
import { routeAIRevision, heuristicRouting, normalizeRouting } from './ai/aiRouter';
import { SECTION_OWNERSHIP, AGENT_ROLES } from '../config/sectionOwnership';
import { SECTION_TITLES } from '../config/blueprintSections';
import { useAIDebugStore } from '../store/useAIDebugStore';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));

// Hard cap on any single AI generation so no agent can hang in "Working" (doc §5).
const AGENT_GENERATION_TIMEOUT_MS = 90000;

const withTimeout = (promiseFn, ms) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
  });
  return Promise.race([promiseFn(), timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// Memory categories per doc §13: Business, Product, Technical, Marketing, Scope
const AGENT_MEMORY_CATEGORY = {
  ceo: 'business',
  pm: 'product',
  developer: 'technical',
  marketing: 'marketing',
  mediator: 'scope'
};

// The order and messaging of the initial generation pipeline.
const AGENT_PIPELINE = [
  {
    id: 'ceo',
    thinking: 'Evaluating market & business model',
    working: 'Drafting Business Strategy',
    doneMsg: 'CEO completed Executive Summary, Target Users, Business Model, Budget, and Risks.',
    contribution: ['Defined revenue model', 'Identified target user segments', 'Estimated budget & business risks']
  },
  {
    id: 'pm',
    thinking: 'Structuring Product Roadmap',
    working: 'Defining Problem, Solution & MVP',
    doneMsg: 'Product Manager completed Problem Statement, Solution, MVP Scope, Features, Roadmap, and Timeline.',
    contribution: ['Prioritized MVP features', 'Authored Problem Statement & Solution', 'Planned roadmap and timeline']
  },
  {
    id: 'developer',
    thinking: 'Designing System Architecture',
    working: 'Generating Architecture & Diagrams',
    doneMsg: 'Developer completed Architecture, Technology Stack, UML, and Database Schemas.',
    contribution: ['Designed system architecture', 'Selected technology stack', 'Generated UML & ER diagrams']
  },
  {
    id: 'marketing',
    thinking: 'Planning Go-to-Market',
    working: 'Drafting Launch Strategy',
    doneMsg: 'Marketing completed Go-to-Market Strategy.',
    contribution: ['Developed launch strategy', 'Identified acquisition channels']
  }
];

// Composed locally by the Mediator — never AI-generated (doc §4).
const composeAgentContributions = () => {
  const { agents } = useProjectStore.getState();
  const lines = AGENT_PIPELINE.map(({ id, contribution }) => {
    const agent = agents[id];
    const sections = (AGENT_ROLES[id] || []).map(s => SECTION_TITLES[s] || s).join(', ');
    return `### ${agent?.name || id} — ${agent?.role || id}\n- **Sections:** ${sections}\n${contribution.map(c => `- ${c}`).join('\n')}`;
  });
  lines.push(`### Alex — Mediator\n- **Sections:** ${SECTION_TITLES.agentContributions}, ${SECTION_TITLES.finalRecommendations}\n- Classified project domain\n- Routed tasks to specialist agents\n- Assembled and versioned the final blueprint`);
  return lines.join('\n\n');
};

export const runInitialSimulation = async (projectData) => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();
  const versionStore = useVersionStore.getState();
  
  console.log("Mediator started");
  
  // Initialize memory
  memoryStore.clearMemory();
  memoryStore.updateMemory('scope', 'budget', projectData?.budget || 'N/A');
  memoryStore.updateMemory('scope', 'timeline', projectData?.timeline || 'N/A');
  memoryStore.updateMemory('scope', 'platforms', projectData?.platform || 'web');
  memoryStore.updateMemory('scope', 'teamSize', projectData?.teamSize || 'N/A');
  memoryStore.updateMemory('scope', 'priorities', projectData?.priorities || 'N/A');
  memoryStore.updateMemory('business', 'targetAudience', projectData?.targetAudience || 'General');

  // 1. Mediator analyzes request
  store.updateAgentStatus('mediator', AGENT_STATUS.THINKING, 'Analyzing project requirements');
  store.addWorkflowEvent({ message: 'Project creation received. Mediator analyzing requirements.', agent: 'mediator' });
  
  const { aiModeEnabled } = useSettingsStore.getState();
  let useAI = aiModeEnabled;

  if (useAI) {
    try {
      store.updateAgentStatus('mediator', AGENT_STATUS.THINKING, 'Classifying Industry Domain');
      const classification = await withTimeout(
        () => classifyDomain(projectData?.name || '', projectData?.idea || ''),
        AGENT_GENERATION_TIMEOUT_MS
      );
      
      memoryStore.updateMemory('scope', 'domain', classification.domain);
      memoryStore.updateMemory('scope', 'industry', classification.industry);
      memoryStore.updateMemory('scope', 'project_type', classification.project_type);
      memoryStore.updateMemory('scope', 'business_model', classification.business_model);
      memoryStore.updateMemory('scope', 'complexity', classification.complexity);
      memoryStore.updateMemory('scope', 'mandatory_entities', classification.mandatory_entities.join(', '));
      memoryStore.updateMemory('scope', 'confidence', classification.confidence + '%');
      memoryStore.updateMemory('scope', 'reasoning', classification.reasoning);
      
      store.addWorkflowEvent({ message: `Mediator classified domain as: ${classification.domain} (${classification.industry}) — Confidence: ${classification.confidence}%`, agent: 'mediator' });
    } catch (err) {
      // ⚠️ Surface the domain classification failure as a visible warning — do NOT silently continue
      store.addWorkflowEvent({ type: 'error', message: `⚠️ Domain Classifier FAILED: ${err.message}. Agents will receive incomplete context.`, agent: 'mediator' });
      console.error('[Simulation] Domain classification error:', err);
      useAI = false; // Disable AI for downstream agents since context is unavailable
    }
  }

  await sleep(1000);
  
  store.updateAgentStatus('mediator', AGENT_STATUS.WORKING, 'Delegating tasks to team');
  store.addWorkflowEvent({ message: 'Requirements analyzed. Delegating tasks to specialist agents.', agent: 'mediator' });
  await sleep(1000);

  const handleAgentGeneration = async (agentId, fallbackSections) => {
    if (!useAI) return fallbackSections;
    try {
      const result = await withTimeout(() => generateAgentContent(agentId), AGENT_GENERATION_TIMEOUT_MS);
      // Update memory with decisions
      if (result.decisions && result.decisions.length > 0) {
         const category = AGENT_MEMORY_CATEGORY[agentId] || 'scope';
         result.decisions.forEach((d, i) => memoryStore.updateMemory(category, `decision_${Date.now()}_${i}`, d));
      }
      store.addWorkflowEvent({ type: 'system', message: `✅ ${agentId.toUpperCase()} generated via Gemini.`, agent: agentId });
      return result.content;
    } catch (err) {
      const reason = err.message === 'Timeout' ? 'Generation timed out' : (err.message || 'Unknown error');
      // ⚠️ Surface the failure visibly — do NOT silently swap with fallback without warning
      store.updateAgentStatus(agentId, AGENT_STATUS.FAILED, reason);
      store.addWorkflowEvent({ type: 'error', message: `⚠️ Gemini FAILED for ${agentId.toUpperCase()}: ${reason}. Using Fallback Factory.`, agent: 'mediator' });
      console.error(`[Simulation] AI generation failed for ${agentId}:`, err);
      await sleep(800);
      return fallbackSections;
    }
  };

  try {
    const blueprintContent = generateDynamicBlueprint(projectData);

    // 2. Specialist agents generate their sections in pipeline order
    store.updateAgentStatus('mediator', AGENT_STATUS.IDLE);
    for (const step of AGENT_PIPELINE) {
      const { id, thinking, working, doneMsg, contribution } = step;
      const sections = AGENT_ROLES[id];

      store.updateAgentStatus(id, AGENT_STATUS.THINKING, thinking);
      store.addWorkflowEvent({ message: `Mediator assigned task to ${useProjectStore.getState().agents[id].role}.`, agent: 'mediator' });
      await sleep(1000);

      store.updateAgentStatus(id, AGENT_STATUS.WORKING, working);
      const content = await handleAgentGeneration(id, pick(blueprintContent, sections));

      sections.forEach(sectionKey => {
        if (content[sectionKey]) {
          store.updateBlueprintSection(sectionKey, content[sectionKey], 'pending', 'High', 'v1');
        }
      });

      store.updateAgentStatus(id, AGENT_STATUS.COMPLETED);
      store.addWorkflowEvent({ message: doneMsg, agent: id, contribution });
      await sleep(500);
    }

    // 3. Mediator wraps up: contributions (always local) + final recommendations
    await sleep(500);
    store.updateAgentStatus('mediator', AGENT_STATUS.REVIEWING, 'Reviewing agent outputs');

    store.updateBlueprintSection('agentContributions', composeAgentContributions(), 'pending', 'High', 'v1');

    const mediatorContent = await handleAgentGeneration('mediator', {
      finalRecommendations: blueprintContent.finalRecommendations
    });
    if (mediatorContent.finalRecommendations) {
      store.updateBlueprintSection('finalRecommendations', mediatorContent.finalRecommendations, 'pending', 'High', 'v1');
    }
    await sleep(1000);
    store.updateAgentStatus('mediator', AGENT_STATUS.UPDATING, 'Finalizing Blueprint');

    store.addWorkflowEvent({ message: 'Blueprint generation complete. Saving Version 1.', agent: 'mediator' });

    // Save Version
    const currentBlueprint = useProjectStore.getState().blueprint;
    versionStore.saveVersion(
      currentBlueprint,
      useAI ? '[AI Generated] Initial Project Creation' : '[Fallback Factory] Initial Project Creation',
      ['ceo', 'pm', 'developer', 'marketing', 'mediator'],
      Object.keys(SECTION_OWNERSHIP)
    );

    store.addWorkflowEvent({
      type: 'system',
      message: useAI ? `Generation Source: Gemini 2.5 Flash` : `Generation Source: Fallback Factory`,
      agent: 'mediator'
    });

    store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, 'Generation Finished');
  } catch (err) {
    // Guaranteed failure state: never leave the workflow hanging (doc §5)
    console.error('[Simulation] Initial generation failed:', err);
    store.updateAgentStatus('mediator', AGENT_STATUS.FAILED, err.message || 'Generation failed');
    store.addWorkflowEvent({ type: 'error', message: `⚠️ Blueprint generation failed: ${err.message || 'Unknown error'}`, agent: 'mediator' });
  } finally {
    // Specialists always return to Idle so the next interaction can start
    ['ceo', 'pm', 'developer', 'marketing'].forEach(agentId => {
      store.updateAgentStatus(agentId, AGENT_STATUS.IDLE, null);
    });
  }
};

export const previewRevision = async (revisionInstruction, targetSectionId = null) => {
  const store = useProjectStore.getState();
  const { aiModeEnabled } = useSettingsStore.getState();

  let routing;

  store.updateAgentStatus('mediator', AGENT_STATUS.ANALYZING, 'Analyzing revision intent');

  try {
    if (targetSectionId) {
      // Local Section Modification — explicit, no routing needed
      routing = normalizeRouting([{
        agent: SECTION_OWNERSHIP[targetSectionId],
        sections: [targetSectionId],
        taskDescription: revisionInstruction,
        reason: 'Explicit modification of this section requested by the user.'
      }], 'Explicit (Local)');
    } else if (aiModeEnabled) {
      // Global Project Evolution (AI Routed, splits multi-part requests)
      store.addWorkflowEvent({ type: 'system', message: `Mediator analyzing routing for global change...`, agent: 'mediator' });
      const memoryStore = useProjectMemoryStore.getState();
      const domain = memoryStore.memory?.scope?.domain || 'Unknown';
      routing = await withTimeout(() => routeAIRevision(revisionInstruction, domain), AGENT_GENERATION_TIMEOUT_MS);
    } else {
      // Global Project Evolution (Static Fallback)
      routing = heuristicRouting(revisionInstruction);
    }
  } catch (err) {
    console.error('[Simulation] Revision preview routing failed:', err);
    store.addWorkflowEvent({ type: 'error', message: `⚠️ Routing failed: ${err.message}. Using heuristic routing.`, agent: 'mediator' });
    routing = heuristicRouting(revisionInstruction);
  } finally {
    // Mediator must never stay stuck in Analyzing (doc §5)
    store.updateAgentStatus('mediator', AGENT_STATUS.IDLE, null);
  }

  return {
    ...routing,
    instruction: revisionInstruction
  };
};

export const applyRevisionSimulation = async (previewData) => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();
  const versionStore = useVersionStore.getState();
  const { aiModeEnabled } = useSettingsStore.getState();
  
  const { instruction, confidence } = previewData;
  // Legacy previews (no task list) become a single task per agent.
  const tasks = previewData.tasks?.length
    ? previewData.tasks
    : normalizeRouting((previewData.assignedAgents || []).map(agent => ({
        agent,
        sections: (previewData.affectedSections || []).filter(s => SECTION_OWNERSHIP[s] === agent),
        taskDescription: instruction,
        reason: ''
      })), confidence).tasks;
  const affectedSections = [...new Set(tasks.flatMap(t => t.sections))];
  const assignedAgents = [...new Set(tasks.map(t => t.agent))];

  store.setRecentRevisionResult(null);

  try {
    // 1. ROUTING
    store.updateAgentStatus('mediator', AGENT_STATUS.ROUTING, `Routing to ${assignedAgents.join(', ').toUpperCase()}`);
    store.setActiveRevision({ request: instruction, category: 'AI Routed', targetAgent: assignedAgents.join(', '), expectedStep: `Updating ${affectedSections.length} sections. Confidence: ${confidence}` });
    await sleep(1500);
    tasks.forEach(task => {
      store.addWorkflowEvent({
        type: 'system',
        message: `Mediator assigned "${task.taskDescription}" to ${task.agent.toUpperCase()}${task.reason ? ` — ${task.reason}` : ''} (Confidence: ${confidence})`,
        agent: 'mediator'
      });
    });

    // 2. WAITING & AGENT WORK
    let changedKeys = [];
    const nextVersionId = `v${versionStore.versions.length + 1}`;

    store.updateAgentStatus('mediator', AGENT_STATUS.WAITING, 'Waiting for team');

    // Run tasks in parallel (one task per agent)
    const agentPromises = tasks.map(async (task) => {
      const { agent: targetAgent, sections: taskSections, taskDescription, reason } = task;
      store.updateAgentStatus(targetAgent, AGENT_STATUS.WORKING, taskDescription || 'Implementing changes', reason);

      if (aiModeEnabled) {
         try {
           const result = await withTimeout(() => generateAgentContent(targetAgent, taskDescription || instruction), AGENT_GENERATION_TIMEOUT_MS);

           if (result.decisions && result.decisions.length > 0) {
             const category = AGENT_MEMORY_CATEGORY[targetAgent] || 'scope';
             result.decisions.forEach((d, i) => memoryStore.updateMemory(category, `revision_${Date.now()}_${i}`, d));
           }

           Object.entries(result.content).forEach(([sectionKey, content]) => {
             // Only update sections this task was routed to
             if (taskSections.includes(sectionKey)) {
               store.updateBlueprintSection(sectionKey, content, 'pending', 'High', nextVersionId);
               changedKeys.push(sectionKey);
             }
           });
         } catch (err) {
           console.warn(`AI Revision failed for ${targetAgent}.`, err);
           const failReason = err.message === 'Timeout' ? 'Generation timed out' : (err.message || 'Unknown error');
           store.updateAgentStatus(targetAgent, AGENT_STATUS.FAILED, failReason);
           store.addWorkflowEvent({ type: 'error', message: `⚠️ AI failed for ${targetAgent.toUpperCase()}: ${failReason}. Section left unchanged.`, agent: 'mediator' });
           await sleep(800);
         }
      } else {
        // Fallback mock logic
        taskSections.forEach(sectionKey => {
           const existing = store.blueprint[sectionKey]?.content || '';
           store.updateBlueprintSection(sectionKey, existing + `\n\n**Revision:** Adjusted based on request: ${taskDescription || instruction}`, 'pending', 'Medium', nextVersionId);
           changedKeys.push(sectionKey);
        });
      }

      store.updateAgentStatus(targetAgent, AGENT_STATUS.IDLE, null);
    });

    await Promise.all(agentPromises);

    // 4. UPDATING
    store.updateAgentStatus('mediator', AGENT_STATUS.UPDATING, 'Finalizing Blueprint');
    await sleep(1500);

    changedKeys = [...new Set(changedKeys)];
    const changesMade = changedKeys.map(k => `${SECTION_TITLES[k] || k} Updated`);
    const summary = composeVersionSummary(changedKeys, aiModeEnabled ? '[AI Generated]' : '[Fallback Factory]');

    const currentBlueprint = useProjectStore.getState().blueprint;
    versionStore.saveVersion(currentBlueprint, summary, assignedAgents, changedKeys);

    store.addWorkflowEvent({
      type: 'revision',
      message: `Revision Applied: ${instruction}`,
      agent: 'mediator',
      request: instruction,
      assignedAgent: assignedAgents.join(', ').toUpperCase(),
      updatedSections: changesMade,
      version: nextVersionId
    });

    store.setRecentRevisionResult({ message: 'Revision Applied Successfully', changes: changesMade, version: nextVersionId });
    store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, 'Revision Finished');
    await sleep(1000);

  } catch (err) {
    console.error("Revision Error:", err);
    const msg = err.message === 'Timeout' ? 'Revision Processing Timeout' : `Error: ${err.message}`;
    store.setRecentRevisionResult({ message: msg, isError: true });
    store.addWorkflowEvent({ type: 'system', message: `Error: ${msg}`, agent: 'mediator' });
  } finally {
    // 5. IDLE
    store.resetAllAgents();
  }
};

// Backwards compatibility alias for components that haven't been updated yet
export const runRevisionSimulation = async (revisionInstruction, category = '', targetSectionId = null) => {
  const preview = await previewRevision(revisionInstruction, targetSectionId);
  await applyRevisionSimulation(preview);
};
