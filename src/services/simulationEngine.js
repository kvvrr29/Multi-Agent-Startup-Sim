import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { useVersionStore } from '../store/versionStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { generateDynamicBlueprint } from './blueprintFactory';
import { useSettingsStore } from '../store/useSettingsStore';
import { generateAgentContent } from './ai/aiBlueprintFactory';
import { classifyDomain } from './ai/domainClassifier';
import { routeAIRevision } from './ai/aiRouter';
import { SECTION_OWNERSHIP } from '../config/sectionOwnership';
import { useAIDebugStore } from '../store/useAIDebugStore';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const runInitialSimulation = async (projectData) => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();
  const versionStore = useVersionStore.getState();
  
  console.log("Mediator started");
  
  // Initialize memory
  memoryStore.clearMemory();
  memoryStore.updateMemory('scope', 'budget', projectData?.budget || 'N/A');
  memoryStore.updateMemory('business', 'targetAudience', projectData?.targetAudience || 'General');

  // 1. Mediator analyzes request
  store.updateAgentStatus('mediator', AGENT_STATUS.THINKING, 'Analyzing project requirements');
  store.addWorkflowEvent({ message: 'Project creation received. Mediator analyzing requirements.', agent: 'mediator' });
  
  const { aiModeEnabled } = useSettingsStore.getState();
  let useAI = aiModeEnabled;

  if (useAI) {
    try {
      store.updateAgentStatus('mediator', AGENT_STATUS.THINKING, 'Classifying Industry Domain');
      const classification = await classifyDomain(projectData?.name || '', projectData?.idea || '');
      
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
      const result = await generateAgentContent(agentId);
      // Update memory with decisions
      if (result.decisions && result.decisions.length > 0) {
         result.decisions.forEach((d, i) => memoryStore.updateMemory(agentId, `decision_${Date.now()}_${i}`, d));
      }
      store.addWorkflowEvent({ type: 'system', message: `✅ ${agentId.toUpperCase()} generated via Gemini.`, agent: agentId });
      return result.content;
    } catch (err) {
      const reason = err.message || 'Unknown error';
      // ⚠️ Surface the failure visibly — do NOT silently swap with fallback without warning
      store.addWorkflowEvent({ type: 'error', message: `⚠️ Gemini FAILED for ${agentId.toUpperCase()}: ${reason}. Using Fallback Factory.`, agent: 'mediator' });
      console.error(`[Simulation] AI generation failed for ${agentId}:`, err);
      return fallbackSections;
    }
  };

  const blueprintContent = generateDynamicBlueprint(projectData);

  // 2. CEO Agent evaluates business
  store.updateAgentStatus('mediator', AGENT_STATUS.IDLE);
  store.updateAgentStatus('ceo', AGENT_STATUS.THINKING, 'Evaluating market & business model');
  store.addWorkflowEvent({ message: 'Mediator assigned task to CEO.', agent: 'mediator' });
  await sleep(1000);
  
  store.updateAgentStatus('ceo', AGENT_STATUS.WORKING, 'Drafting Executive Summary');
  const ceoContent = await handleAgentGeneration('ceo', {
    executiveSummary: blueprintContent.executiveSummary,
    businessModel: blueprintContent.businessModel
  });

  store.updateBlueprintSection('executiveSummary', ceoContent.executiveSummary, 'pending', 'High');
  store.updateBlueprintSection('businessModel', ceoContent.businessModel, 'pending', 'Medium');
  store.updateAgentStatus('ceo', AGENT_STATUS.COMPLETED);
  store.addWorkflowEvent({ 
    message: 'CEO completed Executive Summary and Business Model.', 
    agent: 'ceo',
    contribution: ['Generated revenue model', 'Defined target audience']
  });

  // 3. PM Agent plans features
  await sleep(500);
  store.updateAgentStatus('pm', AGENT_STATUS.THINKING, 'Structuring Product Roadmap');
  store.addWorkflowEvent({ message: 'Mediator assigned task to Product Manager.', agent: 'mediator' });
  await sleep(1000);
  
  store.updateAgentStatus('pm', AGENT_STATUS.WORKING, 'Defining MVP Features');
  const pmContent = await handleAgentGeneration('pm', {
    problemStatement: blueprintContent.problemStatement,
    productRoadmap: blueprintContent.productRoadmap
  });

  store.updateBlueprintSection('problemStatement', pmContent.problemStatement, 'pending', 'High', 'v1');
  store.updateBlueprintSection('productRoadmap', pmContent.productRoadmap, 'pending', 'Medium', 'v1');
  store.updateAgentStatus('pm', AGENT_STATUS.COMPLETED);
  store.addWorkflowEvent({ 
    message: 'Product Manager completed Roadmap and MVP Definition.', 
    agent: 'pm',
    contribution: ['Prioritized MVP features', 'Authored Problem Statement', 'Defined user workflows']
  });

  // 4. Developer Agent plans architecture
  await sleep(500);
  store.updateAgentStatus('developer', AGENT_STATUS.THINKING, 'Designing System Architecture');
  store.addWorkflowEvent({ message: 'Mediator assigned task to Developer.', agent: 'mediator' });
  await sleep(1000);
  
  store.updateAgentStatus('developer', AGENT_STATUS.WORKING, 'Generating Architecture Diagrams');
  const devContent = await handleAgentGeneration('developer', {
    architecture: blueprintContent.architecture,
    umlDiagram: blueprintContent.umlDiagram,
    erDiagram: blueprintContent.erDiagram
  });

  store.updateBlueprintSection('architecture', devContent.architecture, 'pending', 'High');
  store.updateBlueprintSection('umlDiagram', devContent.umlDiagram, 'pending', 'High');
  store.updateBlueprintSection('erDiagram', devContent.erDiagram, 'pending', 'Medium');
  store.updateAgentStatus('developer', AGENT_STATUS.COMPLETED);
  store.addWorkflowEvent({ 
    message: 'Developer completed Architecture, UML, and Database Schemas.', 
    agent: 'developer',
    contribution: ['Designed microservices architecture', 'Generated UML use cases', 'Drafted ER Database schemas']
  });

  // 5. Marketing Agent plans launch
  await sleep(500);
  store.updateAgentStatus('marketing', AGENT_STATUS.THINKING, 'Planning Go-to-Market');
  store.addWorkflowEvent({ message: 'Mediator assigned task to Marketing.', agent: 'mediator' });
  await sleep(1000);
  
  store.updateAgentStatus('marketing', AGENT_STATUS.WORKING, 'Drafting Launch Strategy');
  const mktContent = await handleAgentGeneration('marketing', {
    marketingStrategy: blueprintContent.marketingStrategy
  });

  store.updateBlueprintSection('marketingStrategy', mktContent.marketingStrategy, 'pending', 'Medium');
  store.updateAgentStatus('marketing', AGENT_STATUS.COMPLETED);
  store.addWorkflowEvent({ 
    message: 'Marketing completed Go-to-Market Strategy.', 
    agent: 'marketing',
    contribution: ['Developed launch strategy', 'Identified acquisition channels']
  });

  // 6. Mediator wraps up
  await sleep(1000);
  store.updateAgentStatus('mediator', AGENT_STATUS.WORKING, 'Finalizing Blueprint');
  await sleep(1500);
  store.updateAgentStatus('mediator', AGENT_STATUS.IDLE);
  
  // Reset all statuses for next interaction
  ['ceo', 'pm', 'developer', 'marketing'].forEach(agentId => {
     store.updateAgentStatus(agentId, AGENT_STATUS.IDLE, null);
  });
  
  store.addWorkflowEvent({ message: 'Blueprint generation complete. Saving Version 1.', agent: 'mediator' });
  
  // Save Version
  const currentBlueprint = useProjectStore.getState().blueprint;
  versionStore.saveVersion(
    currentBlueprint, 
    useAI ? '[AI Generated] Initial Project Creation' : '[Fallback Factory] Initial Project Creation', 
    ['ceo', 'pm', 'developer', 'marketing']
  );
  
  store.addWorkflowEvent({ 
    type: 'system', 
    message: useAI ? `Generation Source: Gemini 2.5 Flash` : `Generation Source: Fallback Factory`, 
    agent: 'mediator' 
  });
  
  store.updateAgentStatus('mediator', AGENT_STATUS.COMPLETED, 'Generation Finished');
};

const withTimeout = (promiseFn, ms) => {
  return () => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
    });
    return Promise.race([promiseFn(), timeoutPromise]).finally(() => clearTimeout(timeoutId));
  };
};

export const previewRevision = async (revisionInstruction, targetSectionId = null) => {
  const store = useProjectStore.getState();
  const { aiModeEnabled } = useSettingsStore.getState();

  let affectedSections = [];
  let assignedAgents = [];
  let confidence = 'High';

  store.updateAgentStatus('mediator', AGENT_STATUS.ANALYZING, 'Analyzing revision intent');

  if (targetSectionId) {
    // Local Section Modification
    affectedSections = [targetSectionId];
    assignedAgents = [SECTION_OWNERSHIP[targetSectionId]];
    confidence = 'Explicit (Local)';
  } else if (aiModeEnabled) {
    // Global Project Evolution (AI Routed)
    store.addWorkflowEvent({ type: 'system', message: `Mediator analyzing routing for global change...`, agent: 'mediator' });
    const memoryStore = useProjectMemoryStore.getState();
    const domain = memoryStore.memory?.scope?.domain || 'Unknown';
    const routing = await routeAIRevision(revisionInstruction, domain);
    affectedSections = routing.affectedSections;
    assignedAgents = routing.assignedAgents;
    confidence = routing.confidence;
  } else {
    // Global Project Evolution (Static Fallback)
    const lowerInst = revisionInstruction.toLowerCase();
    if (lowerInst.includes('price') || lowerInst.includes('budget')) { affectedSections = ['businessModel']; assignedAgents = ['ceo']; }
    else if (lowerInst.includes('python') || lowerInst.includes('tech')) { affectedSections = ['architecture']; assignedAgents = ['developer']; }
    else if (lowerInst.includes('student') || lowerInst.includes('marketing')) { affectedSections = ['marketingStrategy']; assignedAgents = ['marketing']; }
    else { affectedSections = ['productRoadmap']; assignedAgents = ['pm']; }
    confidence = 'Low (Fallback)';
  }

  store.updateAgentStatus('mediator', AGENT_STATUS.IDLE, null);

  return {
    affectedSections,
    assignedAgents,
    confidence,
    instruction: revisionInstruction
  };
};

export const applyRevisionSimulation = async (previewData) => {
  const store = useProjectStore.getState();
  const memoryStore = useProjectMemoryStore.getState();
  const versionStore = useVersionStore.getState();
  const { aiModeEnabled } = useSettingsStore.getState();
  
  const { affectedSections, assignedAgents, instruction, confidence } = previewData;

  store.setRecentRevisionResult(null);

  try {
    // 1. ROUTING
    store.updateAgentStatus('mediator', AGENT_STATUS.ROUTING, `Routing to ${assignedAgents.join(', ').toUpperCase()}`);
    store.setActiveRevision({ request: instruction, category: 'AI Routed', targetAgent: assignedAgents.join(', '), expectedStep: `Updating ${affectedSections.length} sections. Confidence: ${confidence}` });
    await sleep(1500);
    store.addWorkflowEvent({ type: 'system', message: `Mediator assigned tasks to ${assignedAgents.join(', ').toUpperCase()} (Confidence: ${confidence})`, agent: 'mediator' });

    // 2. WAITING & AGENT WORK
    let summary = aiModeEnabled ? `[AI Generated] Applied changes across ${affectedSections.length} sections.` : `[Fallback Factory] Applied changes across ${affectedSections.length} sections.`;
    let changesMade = [];
    const nextVersionId = `v${versionStore.versions.length + 1}`;

    store.updateAgentStatus('mediator', AGENT_STATUS.WAITING, 'Waiting for team');

    // Run agents in parallel
    const agentPromises = assignedAgents.map(async (targetAgent) => {
      store.updateAgentStatus(targetAgent, AGENT_STATUS.WORKING, `Implementing changes`);
      
      if (aiModeEnabled) {
         try {
           const result = await generateAgentContent(targetAgent, instruction);
           
           if (result.decisions && result.decisions.length > 0) {
             result.decisions.forEach((d, i) => memoryStore.updateMemory(targetAgent, `revision_${Date.now()}_${i}`, d));
           }

           Object.entries(result.content).forEach(([sectionKey, content]) => {
             // Only update if it's in the affectedSections list OR if it's a global agent payload
             if (affectedSections.includes(sectionKey)) {
               store.updateBlueprintSection(sectionKey, content, 'pending', 'High', nextVersionId);
               changesMade.push(`${sectionKey} Updated`);
             }
           });
         } catch (err) {
           console.warn(`AI Revision failed for ${targetAgent}.`, err);
           store.addWorkflowEvent({ type: 'system', message: `AI failed for ${targetAgent.toUpperCase()}. Skipping.`, agent: 'mediator' });
         }
      } else {
        // Fallback mock logic
        affectedSections.forEach(sectionKey => {
           if (SECTION_OWNERSHIP[sectionKey] === targetAgent) {
             const existing = store.blueprint[sectionKey]?.content || '';
             store.updateBlueprintSection(sectionKey, existing + `\n\n**Revision:** Adjusted based on request: ${instruction}`, 'pending', 'Medium', nextVersionId);
             changesMade.push(`${sectionKey} Updated`);
           }
        });
      }
      
      store.updateAgentStatus(targetAgent, AGENT_STATUS.IDLE, null);
    });

    await Promise.all(agentPromises);

    // 4. UPDATING
    store.updateAgentStatus('mediator', AGENT_STATUS.UPDATING, 'Finalizing Blueprint');
    await sleep(1500);
    
    const currentBlueprint = useProjectStore.getState().blueprint;
    versionStore.saveVersion(currentBlueprint, summary, assignedAgents);
    
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
