import { generateAIContent } from './aiProvider';
import { SECTION_OWNERSHIP } from '../../config/sectionOwnership';

export const routeAIRevision = async (revisionInstruction, projectContext = '') => {
  const systemPrompt = `You are the Mediator AI for a startup platform.
Your job is to analyze a user's revision request and determine exactly which blueprint sections need to be updated.
You MUST output a strict JSON object.

Available Sections and their Owning Agents:
${Object.entries(SECTION_OWNERSHIP).map(([section, agent]) => `- ${section} (Agent: ${agent})`).join('\n')}

Rules:
1. ONLY return sections that are explicitly affected by the request.
2. If the request is generic (e.g., "Make it better"), infer the most likely sections or default to problemStatement and executiveSummary.
3. Return a confidence score ("High", "Medium", "Low") based on how clear the instruction is.`;

  const userPrompt = `Project Context: ${projectContext}\n\nUser Request: "${revisionInstruction}"`;
  
  const schema = {
    type: "OBJECT",
    properties: {
      affectedSections: {
        type: "ARRAY",
        description: "List of exactly matched section keys that need updating.",
        items: { type: "STRING" }
      },
      assignedAgents: {
        type: "ARRAY",
        description: "List of unique agent roles responsible for those sections.",
        items: { type: "STRING" }
      },
      confidence: {
        type: "STRING",
        description: "High, Medium, or Low"
      }
    },
    required: ["affectedSections", "assignedAgents", "confidence"]
  };

  try {
    const rawResponse = await generateAIContent(systemPrompt, userPrompt, schema);
    const parsed = JSON.parse(rawResponse);
    return parsed;
  } catch (err) {
    console.warn("AI Routing failed. Falling back to simple heuristic:", err);
    // Simple heuristic fallback
    const lower = revisionInstruction.toLowerCase();
    let sections = ['productRoadmap'];
    let agents = ['pm'];
    if (lower.includes('price') || lower.includes('budget')) { sections = ['businessModel']; agents = ['ceo']; }
    if (lower.includes('tech') || lower.includes('python')) { sections = ['architecture']; agents = ['developer']; }
    if (lower.includes('student') || lower.includes('marketing')) { sections = ['marketingStrategy']; agents = ['marketing']; }
    
    return {
      affectedSections: sections,
      assignedAgents: agents,
      confidence: "Low"
    };
  }
};
