import { generateAIContent } from './aiProvider';
import { SECTION_OWNERSHIP } from '../../config/sectionOwnership';

// Derives the flat affectedSections/assignedAgents lists from a task list and
// drops tasks referencing unknown agents/sections so bad AI output can't
// corrupt the workflow.
export const normalizeRouting = (tasks, confidence = 'Low') => {
  const validTasks = (Array.isArray(tasks) ? tasks : [])
    .map(t => ({
      agent: t?.agent,
      sections: (Array.isArray(t?.sections) ? t.sections : []).filter(s => SECTION_OWNERSHIP[s]),
      taskDescription: t?.taskDescription || '',
      reason: t?.reason || ''
    }))
    .filter(t => t.sections.length > 0 && Object.values(SECTION_OWNERSHIP).includes(t.agent));

  const affectedSections = [...new Set(validTasks.flatMap(t => t.sections))];
  const assignedAgents = [...new Set(validTasks.map(t => t.agent))];
  return { tasks: validTasks, affectedSections, assignedAgents, confidence };
};

// Static keyword fallback used when AI routing is unavailable or fails.
export const heuristicRouting = (revisionInstruction) => {
  const lower = revisionInstruction.toLowerCase();
  let agent = 'pm';
  let sections = ['productRoadmap', 'mvpScope'];
  let reason = 'No clear category detected — defaulting to product planning.';

  if (lower.includes('price') || lower.includes('budget') || lower.includes('revenue') || lower.includes('cost')) {
    agent = 'ceo'; sections = ['businessModel', 'budgetCostEstimate'];
    reason = 'Request mentions pricing/budget — business responsibility.';
  } else if (lower.includes('python') || lower.includes('tech') || lower.includes('stack') || lower.includes('architecture') || lower.includes('database') || lower.includes('scalab')) {
    agent = 'developer'; sections = ['architecture', 'technologyStack'];
    reason = 'Request mentions technology — engineering responsibility.';
  } else if (lower.includes('student') || lower.includes('marketing') || lower.includes('audience') || lower.includes('launch') || lower.includes('campaign')) {
    agent = 'marketing'; sections = ['marketingStrategy'];
    reason = 'Request mentions audience/marketing — marketing responsibility.';
  }

  return normalizeRouting(
    [{ agent, sections, taskDescription: revisionInstruction, reason }],
    'Low (Fallback)'
  );
};

export const routeAIRevision = async (revisionInstruction, projectContext = '') => {
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

  const userPrompt = `Project Context: ${projectContext}\n\nUser Request: "${revisionInstruction}"`;

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
    return heuristicRouting(revisionInstruction);
  }
};
