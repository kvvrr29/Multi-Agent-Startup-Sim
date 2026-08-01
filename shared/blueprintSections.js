// The blueprint's sections, in render order. Shared by the client (which
// renders exactly these) and the server (which seeds a blueprint_sections row
// per id on project creation), so the two cannot drift apart.
export const BLUEPRINT_SECTIONS = [
  { id: 'executiveSummary', title: 'Executive Summary', type: 'text' },
  { id: 'problemStatement', title: 'Problem Statement', type: 'text' },
  { id: 'proposedSolution', title: 'Proposed Solution', type: 'text' },
  { id: 'targetUsers', title: 'Target Users', type: 'text' },
  { id: 'businessModel', title: 'Business Model', type: 'text' },
  { id: 'mvpScope', title: 'MVP Scope', type: 'text' },
  { id: 'keyFeatures', title: 'Key Features', type: 'text' },
  { id: 'productRoadmap', title: 'Product Roadmap', type: 'text' },
  { id: 'architecture', title: 'System Architecture', type: 'diagram' },
  { id: 'technologyStack', title: 'Technology Stack', type: 'text' },
  { id: 'umlDiagram', title: 'UML Use Cases', type: 'diagram' },
  { id: 'erDiagram', title: 'Entity Relationship Diagram', type: 'diagram' },
  { id: 'marketingStrategy', title: 'Marketing Strategy', type: 'text' },
  { id: 'budgetCostEstimate', title: 'Budget & Cost Estimate', type: 'text' },
  { id: 'risksMitigation', title: 'Risks & Mitigation', type: 'text' },
  { id: 'timeline', title: 'Timeline', type: 'text' },
  { id: 'agentContributions', title: 'Agent Contributions', type: 'text' },
  { id: 'finalRecommendations', title: 'Final Recommendations', type: 'text' }
];

export const BLUEPRINT_SECTION_KEYS = BLUEPRINT_SECTIONS.map((s) => s.id);

export const SECTION_TITLES = Object.fromEntries(
  BLUEPRINT_SECTIONS.map((s) => [s.id, s.title])
);
