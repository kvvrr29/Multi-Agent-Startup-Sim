import { generateAIContent } from './aiProvider';
import { SECTION_OWNERSHIP } from '../../config/sectionOwnership';

// Derives the flat affectedSections/assignedAgents lists from a task list and
// drops tasks referencing unknown agents/sections so bad AI output can't
// corrupt the workflow.
export const normalizeRouting = (tasks, confidence = 'Low') => {
  const validAgents = new Set(Object.values(SECTION_OWNERSHIP));
  const normalized = (Array.isArray(tasks) ? tasks : [])
    .map(t => ({
      agent: t?.agent,
      sections: [...new Set((Array.isArray(t?.sections) ? t.sections : []).filter(s => SECTION_OWNERSHIP[s] === t?.agent))],
      taskDescription: t?.taskDescription || '',
      reason: t?.reason || ''
    }))
    .filter(t => t.sections.length > 0 && validAgents.has(t.agent));

  const byAgent = new Map();
  normalized.forEach(task => {
    const current = byAgent.get(task.agent);
    if (!current) {
      byAgent.set(task.agent, task);
      return;
    }
    current.sections = [...new Set([...current.sections, ...task.sections])];
    if (task.taskDescription && !current.taskDescription.includes(task.taskDescription)) {
      current.taskDescription = [current.taskDescription, task.taskDescription].filter(Boolean).join('; ');
    }
    if (task.reason && !current.reason.includes(task.reason)) {
      current.reason = [current.reason, task.reason].filter(Boolean).join(' ');
    }
  });
  const validTasks = [...byAgent.values()];

  const affectedSections = [...new Set(validTasks.flatMap(t => t.sections))];
  const assignedAgents = [...new Set(validTasks.map(t => t.agent))];
  return { tasks: validTasks, affectedSections, assignedAgents, confidence };
};

// Static keyword fallback used when AI routing is unavailable or fails.
export const heuristicRouting = (revisionInstruction, categoryHint = '') => {
  const lower = revisionInstruction.toLowerCase();
  const tasks = [];
  const matches = (words) => words.some(word => lower.includes(word));
  const add = (agent, sections, reason) => tasks.push({ agent, sections, taskDescription: revisionInstruction, reason });

  if (matches(['price', 'pricing', 'budget', 'revenue', 'cost', 'business model', 'monet'])) {
    add('ceo', ['businessModel', 'budgetCostEstimate'], 'Request mentions pricing/budget — business responsibility.');
  }
  if (matches(['python', 'backend', 'frontend', 'tech', 'stack', 'architecture', 'database', 'scalab', 'api', 'mobile app', 'platform'])) {
    add('developer', ['architecture', 'technologyStack'], 'Request mentions technology — engineering responsibility.');
  }
  if (matches(['student', 'marketing', 'audience', 'launch', 'campaign', 'channel', 'brand', 'acquisition'])) {
    add('marketing', ['marketingStrategy'], 'Request mentions audience/marketing — marketing responsibility.');
  }
  if (matches(['mvp', 'feature', 'roadmap', 'scope', 'smaller', 'timeline', 'problem', 'solution'])) {
    add('pm', ['mvpScope', 'keyFeatures', 'productRoadmap'], 'Request changes product scope or planning.');
  }

  if (tasks.length === 0 && categoryHint) {
    const hinted = {
      Business: ['ceo', ['businessModel', 'budgetCostEstimate']],
      Product: ['pm', ['mvpScope', 'keyFeatures', 'productRoadmap']],
      Technical: ['developer', ['architecture', 'technologyStack']],
      Architecture: ['developer', ['architecture', 'technologyStack']],
      Marketing: ['marketing', ['marketingStrategy']],
      Scope: ['pm', ['mvpScope', 'productRoadmap']]
    }[categoryHint];
    if (hinted) add(hinted[0], hinted[1], `Project Evolution category hint: ${categoryHint}.`);
  }
  if (tasks.length === 0) {
    add('pm', ['productRoadmap', 'mvpScope'], 'No clear category detected — defaulting to product planning.');
  }

  return normalizeRouting(tasks,
    'Low (Fallback)'
  );
};

export const routeAIRevision = async (revisionInstruction, projectContext = '', categoryHint = '') => {
  const systemPrompt = `You are the Mediator AI for a startup platform.
Your job is to analyze a user's revision request, split it into separate tasks (one per responsible agent), and determine exactly which blueprint sections each task updates.
You MUST output a strict JSON object.

Available Sections and their Owning Agents:
${Object.entries(SECTION_OWNERSHIP).map(([section, agent]) => `- ${section} (Agent: ${agent})`).join('\n')}

Rules:
1. If the request contains multiple distinct changes, create one task per change/agent. A single-change request produces a single task.
2. Each task's "sections" must ONLY contain section keys owned by that task's agent, and ONLY sections explicitly affected by the request.
3. "taskDescription" is the specific sub-instruction for that agent (not the whole request).
4. "reason" is one sentence explaining why that agent was selected.
5. If the request is generic (e.g., "Make it better"), infer the most likely sections or default to problemStatement and executiveSummary.
6. Return a confidence score ("High", "Medium", "Low") based on how clear the instruction is.`;

  const userPrompt = `Project Context: ${projectContext}\nCategory Hint: ${categoryHint || 'Auto Detect'}\n\nUser Request: "${revisionInstruction}"`;

  const schema = {
    type: "OBJECT",
    properties: {
      tasks: {
        type: "ARRAY",
        description: "One task per responsible agent.",
        items: {
          type: "OBJECT",
          properties: {
            agent: { type: "STRING", description: "The agent role responsible: ceo, pm, developer, marketing or mediator." },
            sections: { type: "ARRAY", description: "Section keys this task updates.", items: { type: "STRING" } },
            taskDescription: { type: "STRING", description: "The specific sub-instruction for this agent." },
            reason: { type: "STRING", description: "One sentence: why this agent was selected." }
          },
          required: ["agent", "sections", "taskDescription", "reason"]
        }
      },
      confidence: {
        type: "STRING",
        description: "High, Medium, or Low"
      }
    },
    required: ["tasks", "confidence"]
  };

  try {
    const rawResponse = await generateAIContent(systemPrompt, userPrompt, schema);
    const parsed = JSON.parse(rawResponse);
    const normalized = normalizeRouting(parsed.tasks, parsed.confidence || 'Medium');
    if (normalized.tasks.length === 0) {
      throw new Error('AI routing returned no valid tasks.');
    }
    return normalized;
  } catch (err) {
    console.warn("AI Routing failed. Falling back to simple heuristic:", err);
    return heuristicRouting(revisionInstruction, categoryHint);
  }
};
