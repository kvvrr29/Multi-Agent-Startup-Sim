import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { useVersionStore, composeVersionSummary, diffBlueprints } from '../store/versionStore';
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

export const withTimeout = (promiseFn, ms) => {
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
  lines.push(`### Alex — Mediator\n- **Sections:** ${SECTION_TITLES.agentContributions}, ${SECTION_TITLES.finalRecommendations}\n- Classified project domain\n- Routed tasks to specialist agents\n- Assembled and versioned the final blueprint`);
  return lines.join('\n\n');
};

export const runInitialSimulation = async (projectData) => {
  const store = useProjectStore.getState();
  const runId = store.beginWorkflow('initial-generation');
  if (!runId) return { status: 'rejected', reason: 'Another workflow is already active.' };
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
      // NOTE: classifyDomain handles its own retries, fallback, and rate-limit waits internally.
      // Do NOT wrap it in withTimeout — Gemini may need 60-120s for rate-limit sleep before retrying.
      const classification = await classifyDomain(projectData?.name || '', projectData?.idea || '');
      
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
      // Domain classification failure is non-fatal — use fallback and continue.
      // The classifier already returns a 'General' fallback on all error paths;
      // this catch only fires if classifyDomain itself throws unexpectedly.
      console.warn('[Simulation] Domain classification unexpected error (using General fallback):', err.message);
      store.addWorkflowEvent({ type: 'warning', message: `⚠️ Domain Classifier could not complete (${err.message}). Continuing with General domain.`, agent: 'mediator' });
      memoryStore.updateMemory('scope', 'domain', 'General');
      memoryStore.updateMemory('scope', 'industry', 'General');
      memoryStore.updateMemory('scope', 'confidence', '0%');
    }
  }

  await sleep(1000);
  
  store.updateAgentStatus('mediator', AGENT_STATUS.WORKING, 'Delegating tasks to team');
  store.addWorkflowEvent({ message: 'Requirements analyzed. Delegating tasks to specialist agents.', agent: 'mediator' });
  await sleep(1000);

  const handleAgentGeneration = async (agentId, fallbackSections) => {
    if (!useAI) return { content: fallbackSections, decisions: [], generationSource: 'Fallback', scores: null };
    try {
      console.log(`[Status Trace] ${agentId.toUpperCase()} idle -> working (generation started)`);
      // The per-section timeout is now handled inside generateAgentContent
      const result = await generateAgentContent(agentId);
      console.log(`[Status Trace] ${agentId.toUpperCase()} working -> generated -> validated`);
      
      if (!useProjectStore.getState().isCurrentWorkflow(runId)) throw new Error('Stale workflow completion ignored');
      result.decisions?.forEach(decision => memoryStore.applyDecision(decision, { agent: agentId, instruction: 'Initial project generation', version: 'v1' }));
      store.addWorkflowEvent({ type: 'system', message: `✅ ${agentId.toUpperCase()} generated via ${result.generationSource || 'AI'}.`, agent: agentId });
      return result;
    } catch (err) {
      const reason = err.message === 'Timeout' ? 'Generation timed out' : (err.message || 'Unknown error');
      
      // If we already updated the status to COMPLETED, do not overwrite it.
      const currentStatus = useProjectStore.getState().agents[agentId]?.status;
      if (currentStatus === AGENT_STATUS.COMPLETED) {
        console.warn(`[Status Trace] ${agentId.toUpperCase()} ignoring timeout/error because status is already COMPLETED. Error: ${reason}`);
        return { content: fallbackSections, decisions: [], generationSource: 'Fallback', scores: null };
      }
      
      console.log(`[Status Trace] ${agentId.toUpperCase()} working -> failed (${reason})`);
      store.updateAgentStatus(agentId, AGENT_STATUS.FAILED, reason);
      store.addWorkflowEvent({ type: 'error', message: `⚠️ AI FAILED for ${agentId.toUpperCase()}: ${reason}.`, agent: 'mediator' });
      console.error(`[Simulation] AI generation failed for ${agentId}:`, err);
      // Bubble up the error
      throw err;
    }
  };

  try {
    const blueprintContent = generateDynamicBlueprint(projectData);

    // 2. Specialist agents generate their sections
    store.updateAgentStatus('mediator', AGENT_STATUS.IDLE);
    
    const activeProvider = useSettingsStore.getState().aiProvider;
    const isWebLLM = (useProjectStore.getState().project?.aiProvider || activeProvider || 'webllm') !== 'gemini';

    const processAgent = async (step) => {
      const { id, thinking, working, doneMsg, contribution } = step;
      const sections = AGENT_ROLES[id];

      store.updateAgentStatus(id, AGENT_STATUS.THINKING, thinking);
      store.addWorkflowEvent({ message: `Mediator assigned task to ${useProjectStore.getState().agents[id].role}.`, agent: 'mediator' });
      await sleep(1000 + Math.random() * 500); // jitter

      store.updateAgentStatus(id, AGENT_STATUS.WORKING, working);
      const result = await handleAgentGeneration(id, pick(blueprintContent, sections));
      if (!useProjectStore.getState().isCurrentWorkflow(runId)) return;

      sections.forEach(sectionKey => {
        if (result.content[sectionKey]) {
          console.log(`[Trace] ${id.toUpperCase()} - ${sectionKey} - Blueprint saved`);
          store.updateBlueprintSection(sectionKey, result.content[sectionKey], 'pending', 'v1', sectionMetadata({
            source: result.generationSource, agent: id, scores: result.scores, failureReason: result.failureReason
          }));
        }
      });

      console.log(`[Status Trace] ${id.toUpperCase()} validated -> blueprint saved -> completed`);
      console.log(`[Trace] ${id.toUpperCase()} - Status changed to COMPLETED`);
      store.updateAgentStatus(id, AGENT_STATUS.COMPLETED);
      store.addWorkflowEvent({ message: doneMsg, agent: id, contribution });
    };

    // Run agents SEQUENTIALLY to prevent WebGPU OOM crashes (WebLLM) 
    // and to prevent 429 Rate Limit Exhaustion (Gemini).
    console.log('[Orchestration] Running agents SEQUENTIALLY.');
    for (const step of AGENT_PIPELINE) {
      try {
        await processAgent(step);
      } catch (err) {
        console.error(`[Simulation] Agent ${step.id} failed. Aborting pipeline.`, err);
        throw new Error(`Pipeline aborted: Agent ${step.id} failed to generate. Last error: ${err.message}`);
      }
    }
    
    if (!useProjectStore.getState().isCurrentWorkflow(runId)) return { status: 'stale' };

    // 3. Mediator wraps up: contributions (always local) + final recommendations
    await sleep(500);
    store.updateAgentStatus('mediator', AGENT_STATUS.REVIEWING, 'Reviewing agent outputs');

    store.updateBlueprintSection('agentContributions', composeAgentContributions(), 'pending', 'v1', sectionMetadata({ source: 'Local', agent: 'mediator' }));

    const mediatorContent = await handleAgentGeneration('mediator', {
      finalRecommendations: blueprintContent.finalRecommendations
    });
    if (mediatorContent.content.finalRecommendations) {
      store.updateBlueprintSection('finalRecommendations', mediatorContent.content.finalRecommendations, 'pending', 'v1', sectionMetadata({
        source: mediatorContent.generationSource, agent: 'mediator', scores: mediatorContent.scores, failureReason: mediatorContent.failureReason
      }));
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
      Object.keys(SECTION_OWNERSHIP),
      { changeType: 'initial', completionStatus: 'success', memorySnapshot: memoryStore.getSnapshot() }
    );

    const activeProviderName = useSettingsStore.getState().aiProvider === 'gemini' ? 'Gemini 2.5 Flash' : 'Built-in AI (WebLLM)';
    store.addWorkflowEvent({
      type: 'system',
      message: useAI ? `Generation Source: ${activeProviderName}` : `Generation Source: Fallback Factory`,
      agent: 'mediator'
    });

    store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, 'Generation Finished');
    
    // Print WEBLLM GENERATION REPORT
    if (isWebLLM) {
      const logs = useAIDebugStore.getState().logs || [];
      const totalRequested = 17;
      const totalGenerated = logs.filter(l => l.validationResult === 'PASSED' || l.validationResult === 'FAILED').length;
      const totalValidated = logs.filter(l => l.validationResult === 'PASSED').length;
      const fallbacks = logs.filter(l => l.validationResult === 'FALLBACK' || l.fallbackReason).length;
      const timeouts = logs.filter(l => (l.fallbackReason || '').toLowerCase().includes('timeout')).length;
      
      const bp = useProjectStore.getState().blueprint;
      const totalSaved = Object.keys(bp).filter(k => k !== 'agentContributions' && bp[k]?.content).length;
      
      const domainPass = logs.some(l => l.agent === 'domain' && l.validationResult === 'PASSED') ? 'PASS' : 'FAIL';
      const getAgentGen = (role) => logs.filter(l => l.agent === role && l.parsedJson !== null).length;
      const getAgentReq = (role) => AGENT_ROLES[role]?.length || 1;
      
      const formatAgent = (role) => `generated ${getAgentGen(role)}/${getAgentReq(role)}`;
      
      console.log(`\n==============================`);
      console.log(`WEBLLM GENERATION REPORT`);
      console.log(`==============================`);
      console.log(`Provider: WebLLM`);
      console.log(`Domain Classification: ${domainPass}`);
      console.log(`CEO:\n${formatAgent('ceo')}`);
      console.log(`PM:\n${formatAgent('pm')}`);
      console.log(`Developer:\n${formatAgent('developer')}`);
      console.log(`Marketing:\n${formatAgent('marketing')}`);
      console.log(`Mediator:\n${formatAgent('mediator')}`);
      console.log(`Validation Success:\n${totalValidated}/${totalRequested}`);
      console.log(`Saved:\n${totalSaved}/${totalRequested}`);
      console.log(`Rendered:\n${totalSaved}/${totalRequested}`);
      console.log(`Fallback Sections:\n${fallbacks}`);
      console.log(`Timeouts:\n${timeouts}`);
      console.log(`Total AI Calls:\n${logs.length}`);
      console.log(`Average Generation Time:\n(Calculated via external diagnostic trace)`);
      console.log(`Total Generation Time:\n(Calculated via external diagnostic trace)`);
      console.log(`==============================\n`);
    }
    return { status: 'changed', version: 'v1' };
  } catch (err) {
    console.error('[Simulation] Initial generation failed:', err);
    store.updateAgentStatus('mediator', AGENT_STATUS.FAILED, err.message || 'Generation failed');
    store.addWorkflowEvent({ type: 'error', message: `⚠️ Blueprint generation failed: ${err.message || 'Unknown error'}`, agent: 'mediator' });
    
    if (import.meta.env.DEV) {
      // In Development mode, we crash loud and proud so the developer can see the exact failure trace.
      store.setGenerationError({ 
        message: err.message || 'Unknown error', 
        stack: err.stack,
        isDev: true
      });
      throw err;
    } else {
      // In Production mode, we show a graceful error panel instead of crashing or generating fake data.
      store.setGenerationError({ 
        message: err.message || 'Unknown error',
        stack: err.stack,
        isDev: false
      });
      return { status: 'failed', reason: err.message || 'Generation failed' };
    }
  } finally {
    await sleep(500);
    // Don't reset agents if we had a fatal error, so the UI can show the failed state alongside the error panel.
    const currentState = useProjectStore.getState();
    const isFailed = currentState.generationError !== null;
    if (!isFailed) {
      currentState.resetAllAgents();
    }
    currentState.endWorkflow(runId);
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
      // NOTE: routeAIRevision already catches its own failures and falls back to heuristics.
      // Do NOT wrap in withTimeout — Gemini may need time for rate-limit retries.
      routing = await routeAIRevision(revisionInstruction, domain, categoryHint);
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
    const maxVersion = versionStore.versions.reduce((max, version) => Math.max(max, Number(version.id.slice(1)) || 0), 0);
    const nextVersionId = `v${maxVersion + 1}`;

    store.updateAgentStatus('mediator', AGENT_STATUS.WAITING, 'Waiting for team');

    // Run tasks sequentially (one task per agent)
    const taskResults = [];
    for (const task of tasks) {
      const { agent: targetAgent, sections: taskSections, taskDescription, reason } = task;
      store.updateAgentStatus(targetAgent, AGENT_STATUS.ASSIGNED, taskDescription || 'Revision assigned', reason);
      await sleep(150);
      store.updateAgentStatus(targetAgent, AGENT_STATUS.WORKING, taskDescription || 'Implementing changes', reason);

      if (aiModeEnabled) {
         try {
           const result = await generateAgentContent(targetAgent, taskDescription || instruction);
           if (!useProjectStore.getState().isCurrentWorkflow(runId)) {
             taskResults.push({ status: 'failed', agent: targetAgent, reason: 'Stale workflow completion ignored', changedSections: [] });
             continue;
           }
           store.updateAgentStatus(targetAgent, AGENT_STATUS.REVIEWING, 'Reviewing generated changes');
           const changedSections = [];
           Object.entries(result.content).forEach(([sectionKey, content]) => {
             // Only update sections this task was routed to
             if (taskSections.includes(sectionKey)) {
               const existing = useProjectStore.getState().blueprint[sectionKey]?.content || '';
               if (content.trim() !== existing.trim()) {
                 store.updateBlueprintSection(sectionKey, content, 'pending', nextVersionId, sectionMetadata({
                   source: result.generationSource, agent: targetAgent, scores: result.scores
                 }));
                 changedSections.push(sectionKey);
               }
             }
           });
           if (changedSections.length) {
             result.decisions?.forEach(decision => memoryStore.applyDecision(decision, {
               agent: targetAgent, instruction: taskDescription || instruction, version: nextVersionId
             }));
           }
           store.updateAgentStatus(targetAgent, AGENT_STATUS.COMPLETED, changedSections.length ? 'Task completed' : 'No changes required');
           taskResults.push({ status: changedSections.length ? 'changed' : 'unchanged', agent: targetAgent, changedSections });
         } catch (err) {
           console.warn(`AI Revision failed for ${targetAgent}.`, err);
           const failReason = err.message === 'Timeout' ? 'Generation timed out' : (err.message || 'Unknown error');
           store.updateAgentStatus(targetAgent, AGENT_STATUS.FAILED, failReason);
           store.addWorkflowEvent({ type: 'error', message: `⚠️ AI failed for ${targetAgent.toUpperCase()}: ${failReason}. Section left unchanged.`, agent: 'mediator' });
           await sleep(800);
           taskResults.push({ status: 'failed', agent: targetAgent, reason: failReason, changedSections: [] });
         }
      } else {
        // Fallback mock logic
        const changedSections = [];
        taskSections.forEach(sectionKey => {
           const existing = useProjectStore.getState().blueprint[sectionKey]?.content || '';
           const revised = `${existing}\n\n**Revision:** Adjusted based on request: ${taskDescription || instruction}`.trim();
           if (revised !== existing.trim()) {
             store.updateBlueprintSection(sectionKey, revised, 'pending', nextVersionId, sectionMetadata({ source: 'Fallback', agent: targetAgent }));
             changedSections.push(sectionKey);
           }
        });
        store.updateAgentStatus(targetAgent, AGENT_STATUS.COMPLETED, changedSections.length ? 'Task completed' : 'No changes required');
        taskResults.push({ status: changedSections.length ? 'changed' : 'unchanged', agent: targetAgent, changedSections });
      }
    }
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
        ? 'Revision failed: every assigned task failed. No version was created.'
        : 'Revision made no content changes. No version was created.';
      const result = { message, isError: allFailed, status: allFailed ? 'failed' : 'unchanged', taskResults };
      store.setRecentRevisionResult(result);
      store.addWorkflowEvent({ type: allFailed ? 'error' : 'system', message, agent: 'mediator' });
      store.updateAgentStatus('mediator', allFailed ? AGENT_STATUS.FAILED : AGENT_STATUS.COMPLETED, message);
      await sleep(700);
      return result;
    }

    const changesMade = changedKeys.map(k => `${SECTION_TITLES[k] || k} Updated`);
    const summary = composeVersionSummary(changedKeys, aiModeEnabled ? '[AI Generated]' : '[Fallback Factory]');
    const completionStatus = failedTasks.length ? 'partial' : 'success';

    const currentBlueprint = useProjectStore.getState().blueprint;
    const savedVersion = versionStore.saveVersion(currentBlueprint, summary, assignedAgents, changedKeys, {
      changeType: 'revision', completionStatus, memorySnapshot: memoryStore.getSnapshot()
    });

    store.addWorkflowEvent({
      type: 'revision',
      message: `Revision Applied: ${instruction}`,
      agent: 'mediator',
      request: instruction,
      assignedAgent: assignedAgents.join(', ').toUpperCase(),
      updatedSections: changesMade,
      version: savedVersion.id,
      status: completionStatus
    });

    const result = {
      message: completionStatus === 'partial' ? `Revision partially completed (${failedTasks.length} task${failedTasks.length === 1 ? '' : 's'} failed)` : 'Revision Applied Successfully',
      changes: changesMade,
      version: savedVersion.id,
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
    const blueprint = useProjectStore.getState().blueprint;
    const version = useVersionStore.getState().saveVersion(
      blueprint,
      `${SECTION_TITLES[sectionKey] || sectionKey} Approved`,
      [SECTION_OWNERSHIP[sectionKey]],
      [sectionKey],
      { changeType: 'approval', completionStatus: 'success', memorySnapshot: useProjectMemoryStore.getState().getSnapshot() }
    );
    store.addWorkflowEvent({ type: 'revision', message: `${SECTION_TITLES[sectionKey] || sectionKey} approved`, agent: 'mediator', version: version.id });
    return { status: 'changed', version: version.id };
  } finally {
    store.endWorkflow(runId);
  }
};

export const restoreVersionWorkflow = async (versionId) => {
  const store = useProjectStore.getState();
  const runId = store.beginWorkflow('restore');
  if (!runId) return { status: 'failed', reason: 'Another workflow is active.' };
  try {
    const source = useVersionStore.getState().getVersion(versionId);
    if (!source) return { status: 'failed', reason: `Version ${versionId} was not found.` };
    store.updateAgentStatus('mediator', AGENT_STATUS.UPDATING, `Restoring ${versionId}`);
    const current = store.blueprint;
    const diff = diffBlueprints(current, source.blueprintSnapshot);
    const currentMemory = useProjectMemoryStore.getState().getSnapshot();
    const memoryChanged = JSON.stringify(currentMemory) !== JSON.stringify(source.memorySnapshot || currentMemory);
    const affectedSections = [...new Set([...diff.changed, ...diff.added, ...diff.removed])];
    if (affectedSections.length === 0 && !memoryChanged) return { status: 'unchanged' };
    store.setBlueprint(source.blueprintSnapshot);
    if (source.memorySnapshot) useProjectMemoryStore.getState().restoreSnapshot(source.memorySnapshot);
    const restoredBlueprint = useProjectStore.getState().blueprint;
    const version = useVersionStore.getState().saveVersion(
      restoredBlueprint,
      `Restored from ${versionId}`,
      [...new Set(affectedSections.map(section => SECTION_OWNERSHIP[section]).filter(Boolean))],
      affectedSections,
      {
        changeType: 'restore', completionStatus: 'success', restoredFrom: versionId,
        memorySnapshot: useProjectMemoryStore.getState().getSnapshot()
      }
    );
    store.addWorkflowEvent({ type: 'revision', message: `Restored from ${versionId} as ${version.id}`, agent: 'mediator', version: version.id });
    store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, `Restored as ${version.id}`);
    return { status: 'changed', version: version.id };
  } finally {
    await sleep(400);
    store.resetAllAgents();
    store.endWorkflow(runId);
  }
};

export const resetAllProjectData = () => {
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useVersionStore.getState().reset();
  useAIDebugStore.getState().reset();
  useAICostStore.getState().reset();
};
