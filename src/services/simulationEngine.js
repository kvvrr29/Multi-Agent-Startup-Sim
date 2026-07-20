import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { generateDynamicBlueprint } from './blueprintFactory';
import { useSettingsStore } from '../store/useSettingsStore';
import { generateAgentContent } from './ai/aiBlueprintFactory';
import { classifyDomain } from './ai/domainClassifier';
import { routeAIRevision, heuristicRouting, normalizeRouting } from './ai/aiRouter';
import { SECTION_OWNERSHIP, AGENT_ROLES } from '../config/sectionOwnership';
import { SECTION_TITLES } from '../config/blueprintSections';
import { useAIDebugStore } from '../store/useAIDebugStore';
import { useAICostStore } from '../store/useAICostStore';

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

const sectionMetadata = ({ source, agent, scores = null, failureReason = null }) => ({
  generationSource: source,
  generatedBy: agent,
  validationScores: scores,
  generatedAt: new Date().toISOString(),
  failureReason
});

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
  lines.push(`### Alex — Mediator\n- **Sections:** ${SECTION_TITLES.agentContributions}, ${SECTION_TITLES.finalRecommendations}\n- Classified project domain\n- Routed tasks to specialist agents\n- Assembled the final blueprint`);
  return lines.join('\n\n');
};

export const runInitialSimulation = async (projectData) => {
  const store = useProjectStore.getState();
  const runId = store.beginWorkflow('initial-generation');
  if (!runId) return { status: 'rejected', reason: 'Another workflow is already active.' };
  const memoryStore = useProjectMemoryStore.getState();

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
      
      store.addWorkflowEvent({ message: `Mediator classified domain as: ${classification.domain} (${classification.industry})`, agent: 'mediator' });
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
    if (!useAI) return { content: fallbackSections, decisions: [], generationSource: 'Fallback', scores: null };
    try {
      const result = await withTimeout(() => generateAgentContent(agentId), AGENT_GENERATION_TIMEOUT_MS);
      if (!useProjectStore.getState().isCurrentWorkflow(runId)) throw new Error('Stale workflow completion ignored');
      result.decisions?.forEach(decision => memoryStore.applyDecision(decision, { agent: agentId, instruction: 'Initial project generation' }));
      store.addWorkflowEvent({ type: 'system', message: `✅ ${agentId.toUpperCase()} generated via Gemini.`, agent: agentId });
      return result;
    } catch (err) {
      const reason = err.message === 'Timeout' ? 'Generation timed out' : (err.message || 'Unknown error');
      // ⚠️ Surface the failure visibly — do NOT silently swap with fallback without warning
      store.updateAgentStatus(agentId, AGENT_STATUS.FAILED, reason);
      store.addWorkflowEvent({ type: 'error', message: `⚠️ Gemini FAILED for ${agentId.toUpperCase()}: ${reason}. Using Fallback Factory.`, agent: 'mediator' });
      console.error(`[Simulation] AI generation failed for ${agentId}:`, err);
      await sleep(800);
      return { content: fallbackSections, decisions: [], generationSource: 'Fallback', scores: null, failureReason: reason };
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
      const result = await handleAgentGeneration(id, pick(blueprintContent, sections));
      if (!useProjectStore.getState().isCurrentWorkflow(runId)) return { status: 'stale' };

      sections.forEach(sectionKey => {
        if (result.content[sectionKey]) {
          store.updateBlueprintSection(sectionKey, result.content[sectionKey], 'pending', sectionMetadata({
            source: result.generationSource || 'Gemini', agent: id, scores: result.scores, failureReason: result.failureReason
          }));
        }
      });

      store.updateAgentStatus(id, AGENT_STATUS.COMPLETED);
      store.addWorkflowEvent({ message: doneMsg, agent: id, contribution });
      await sleep(500);
    }

    // 3. Mediator wraps up: contributions (always local) + final recommendations
    await sleep(500);
    store.updateAgentStatus('mediator', AGENT_STATUS.REVIEWING, 'Reviewing agent outputs');

    store.updateBlueprintSection('agentContributions', composeAgentContributions(), 'pending', sectionMetadata({ source: 'Local', agent: 'mediator' }));

    const mediatorContent = await handleAgentGeneration('mediator', {
      finalRecommendations: blueprintContent.finalRecommendations
    });
    if (mediatorContent.content.finalRecommendations) {
      store.updateBlueprintSection('finalRecommendations', mediatorContent.content.finalRecommendations, 'pending', sectionMetadata({
        source: mediatorContent.generationSource || 'Gemini', agent: 'mediator', scores: mediatorContent.scores, failureReason: mediatorContent.failureReason
      }));
    }
    await sleep(1000);
    store.updateAgentStatus('mediator', AGENT_STATUS.UPDATING, 'Finalizing Blueprint');

    store.addWorkflowEvent({ message: 'Blueprint generation complete.', agent: 'mediator' });

    store.addWorkflowEvent({
      type: 'system',
      message: useAI ? `Generation Source: Gemini 2.5 Flash` : `Generation Source: Fallback Factory`,
      agent: 'mediator'
    });

    store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, 'Generation Finished');
    return { status: 'changed' };
  } catch (err) {
    // Guaranteed failure state: never leave the workflow hanging (doc §5)
    console.error('[Simulation] Initial generation failed:', err);
    store.updateAgentStatus('mediator', AGENT_STATUS.FAILED, err.message || 'Generation failed');
    store.addWorkflowEvent({ type: 'error', message: `⚠️ Blueprint generation failed: ${err.message || 'Unknown error'}`, agent: 'mediator' });
    return { status: 'failed', reason: err.message || 'Generation failed' };
  } finally {
    await sleep(500);
    useProjectStore.getState().resetAllAgents();
    useProjectStore.getState().endWorkflow(runId);
  }
};

export const previewRevision = async (revisionInstruction, targetSectionId = null, categoryHint = '') => {
  const store = useProjectStore.getState();
  const runId = store.beginWorkflow('revision-preview');
  if (!runId) return { tasks: [], affectedSections: [], assignedAgents: [], confidence: 'Rejected', instruction: revisionInstruction, error: 'Another workflow is active.' };
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
      routing = await withTimeout(() => routeAIRevision(revisionInstruction, domain, categoryHint), AGENT_GENERATION_TIMEOUT_MS);
    } else {
      // Global Project Evolution (Static Fallback)
      routing = heuristicRouting(revisionInstruction, categoryHint);
    }
  } catch (err) {
    console.error('[Simulation] Revision preview routing failed:', err);
    store.addWorkflowEvent({ type: 'error', message: `⚠️ Routing failed: ${err.message}. Using heuristic routing.`, agent: 'mediator' });
    routing = heuristicRouting(revisionInstruction, categoryHint);
  } finally {
    // Mediator must never stay stuck in Analyzing (doc §5)
    store.updateAgentStatus('mediator', AGENT_STATUS.IDLE, null);
    store.endWorkflow(runId);
  }

  return {
    ...routing,
    instruction: revisionInstruction,
    categoryHint
  };
};

export const applyRevisionSimulation = async (previewData) => {
  const store = useProjectStore.getState();
  const runId = store.beginWorkflow('revision-apply');
  if (!runId) {
    const result = { message: 'Another workflow is already active.', isError: true, status: 'failed' };
    store.setRecentRevisionResult(result);
    return result;
  }
  const memoryStore = useProjectMemoryStore.getState();
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
  const assignedAgents = [...new Set(tasks.map(t => t.agent))];

  store.setRecentRevisionResult(null);

  try {
    if (tasks.length === 0) throw new Error('No valid revision tasks remain after ownership validation.');

    // 1. ROUTING
    store.updateAgentStatus('mediator', AGENT_STATUS.ROUTING, `Routing to ${assignedAgents.join(', ').toUpperCase()}`);
    store.setActiveRevision({ request: instruction, category: previewData.categoryHint || 'AI Routed', targetAgent: assignedAgents.join(', '), expectedStep: `Updating ${tasks.flatMap(t => t.sections).length} sections.` });
    await sleep(1500);
    tasks.forEach(task => {
      store.addWorkflowEvent({
        type: 'system',
        message: `Mediator assigned "${task.taskDescription}" to ${task.agent.toUpperCase()}${task.reason ? ` — ${task.reason}` : ''}`,
        agent: 'mediator'
      });
    });

    // 2. WAITING & AGENT WORK
    store.updateAgentStatus('mediator', AGENT_STATUS.WAITING, 'Waiting for team');

    // Run tasks in parallel (one task per agent)
    const agentPromises = tasks.map(async (task) => {
      const { agent: targetAgent, sections: taskSections, taskDescription, reason } = task;
      store.updateAgentStatus(targetAgent, AGENT_STATUS.ASSIGNED, taskDescription || 'Revision assigned', reason);
      await sleep(150);
      store.updateAgentStatus(targetAgent, AGENT_STATUS.WORKING, taskDescription || 'Implementing changes', reason);

      if (aiModeEnabled) {
         try {
           const result = await withTimeout(() => generateAgentContent(targetAgent, taskDescription || instruction), AGENT_GENERATION_TIMEOUT_MS);
           if (!useProjectStore.getState().isCurrentWorkflow(runId)) return { status: 'failed', agent: targetAgent, reason: 'Stale workflow completion ignored', changedSections: [] };
           store.updateAgentStatus(targetAgent, AGENT_STATUS.REVIEWING, 'Reviewing generated changes');
           const changedSections = [];
           Object.entries(result.content).forEach(([sectionKey, content]) => {
             // Only update sections this task was routed to
             if (taskSections.includes(sectionKey)) {
               const existing = useProjectStore.getState().blueprint[sectionKey]?.content || '';
               if (content.trim() !== existing.trim()) {
                 store.updateBlueprintSection(sectionKey, content, 'pending', sectionMetadata({
                   source: result.generationSource || 'Gemini', agent: targetAgent, scores: result.scores
                 }));
                 changedSections.push(sectionKey);
               }
             }
           });
           if (changedSections.length) {
             result.decisions?.forEach(decision => memoryStore.applyDecision(decision, {
               agent: targetAgent, instruction: taskDescription || instruction
             }));
           }
           store.updateAgentStatus(targetAgent, AGENT_STATUS.COMPLETED, changedSections.length ? 'Task completed' : 'No changes required');
           return { status: changedSections.length ? 'changed' : 'unchanged', agent: targetAgent, changedSections };
         } catch (err) {
           console.warn(`AI Revision failed for ${targetAgent}.`, err);
           const failReason = err.message === 'Timeout' ? 'Generation timed out' : (err.message || 'Unknown error');
           store.updateAgentStatus(targetAgent, AGENT_STATUS.FAILED, failReason);
           store.addWorkflowEvent({ type: 'error', message: `⚠️ AI failed for ${targetAgent.toUpperCase()}: ${failReason}. Section left unchanged.`, agent: 'mediator' });
           await sleep(800);
           return { status: 'failed', agent: targetAgent, reason: failReason, changedSections: [] };
         }
      } else {
        // Fallback mock logic
        const changedSections = [];
        taskSections.forEach(sectionKey => {
           const existing = useProjectStore.getState().blueprint[sectionKey]?.content || '';
           const revised = `${existing}\n\n**Revision:** Adjusted based on request: ${taskDescription || instruction}`.trim();
           if (revised !== existing.trim()) {
             store.updateBlueprintSection(sectionKey, revised, 'pending', sectionMetadata({ source: 'Fallback', agent: targetAgent }));
             changedSections.push(sectionKey);
           }
        });
        store.updateAgentStatus(targetAgent, AGENT_STATUS.COMPLETED, changedSections.length ? 'Task completed' : 'No changes required');
        return { status: changedSections.length ? 'changed' : 'unchanged', agent: targetAgent, changedSections };
      }
    });

    const taskResults = await Promise.all(agentPromises);
    if (!useProjectStore.getState().isCurrentWorkflow(runId)) return { status: 'failed', reason: 'Stale workflow completion ignored' };

    // 4. UPDATING
    store.updateAgentStatus('mediator', AGENT_STATUS.UPDATING, 'Finalizing Blueprint');
    await sleep(1500);

    const changedKeys = [...new Set(taskResults.flatMap(result => result.changedSections || []))];
    const failedTasks = taskResults.filter(result => result.status === 'failed');
    const unchangedTasks = taskResults.filter(result => result.status === 'unchanged');

    if (changedKeys.length === 0) {
      const allFailed = failedTasks.length === taskResults.length;
      const message = allFailed
        ? 'Revision failed: every assigned task failed. No changes were saved.'
        : 'Revision made no content changes. Nothing was saved.';
      const result = { message, isError: allFailed, status: allFailed ? 'failed' : 'unchanged', taskResults };
      store.setRecentRevisionResult(result);
      store.addWorkflowEvent({ type: allFailed ? 'error' : 'system', message, agent: 'mediator' });
      store.updateAgentStatus('mediator', allFailed ? AGENT_STATUS.FAILED : AGENT_STATUS.COMPLETED, message);
      await sleep(700);
      return result;
    }

    const changesMade = changedKeys.map(k => `${SECTION_TITLES[k] || k} Updated`);
    const completionStatus = failedTasks.length ? 'partial' : 'success';

    store.addWorkflowEvent({
      type: 'revision',
      message: `Revision Applied: ${instruction}`,
      agent: 'mediator',
      request: instruction,
      assignedAgent: assignedAgents.join(', ').toUpperCase(),
      updatedSections: changesMade,
      status: completionStatus
    });

    const result = {
      message: completionStatus === 'partial' ? `Revision partially completed (${failedTasks.length} task${failedTasks.length === 1 ? '' : 's'} failed)` : 'Revision Applied Successfully',
      changes: changesMade,
      status: completionStatus,
      taskResults,
      unchangedTasks: unchangedTasks.length
    };
    store.setRecentRevisionResult(result);
    store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, 'Revision Finished');
    await sleep(1000);
    return result;

  } catch (err) {
    console.error("Revision Error:", err);
    const msg = err.message === 'Timeout' ? 'Revision Processing Timeout' : `Error: ${err.message}`;
    store.setRecentRevisionResult({ message: msg, isError: true });
    store.addWorkflowEvent({ type: 'system', message: `Error: ${msg}`, agent: 'mediator' });
    store.updateAgentStatus('mediator', AGENT_STATUS.FAILED, msg);
    await sleep(700);
    return { message: msg, isError: true, status: 'failed' };
  } finally {
    // 5. IDLE
    store.resetAllAgents();
    store.endWorkflow(runId);
  }
};

// Backwards compatibility alias for components that haven't been updated yet
export const runRevisionSimulation = async (revisionInstruction, category = '', targetSectionId = null) => {
  const preview = await previewRevision(revisionInstruction, targetSectionId, category);
  return applyRevisionSimulation(preview);
};

export const approveSectionWorkflow = (sectionKey) => {
  const store = useProjectStore.getState();
  const runId = store.beginWorkflow('approval');
  if (!runId) return { status: 'failed', reason: 'Another workflow is active.' };
  try {
    const section = store.blueprint[sectionKey];
    if (!section || section.status === 'approved') return { status: 'unchanged' };
    if (!store.approveBlueprintSection(sectionKey, runId)) return { status: 'failed' };
    store.addWorkflowEvent({ type: 'revision', message: `${SECTION_TITLES[sectionKey] || sectionKey} approved`, agent: 'mediator' });
    return { status: 'changed' };
  } finally {
    store.endWorkflow(runId);
  }
};

export const resetAllProjectData = () => {
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useAIDebugStore.getState().reset();
  useAICostStore.getState().reset();
};
