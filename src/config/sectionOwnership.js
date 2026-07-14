export const SECTION_OWNERSHIP = {
  executiveSummary: 'ceo',
  targetUsers: 'ceo',
  businessModel: 'ceo',
  budgetCostEstimate: 'ceo',
  risksMitigation: 'ceo',
  problemStatement: 'pm',
  proposedSolution: 'pm',
  mvpScope: 'pm',
  keyFeatures: 'pm',
  productRoadmap: 'pm',
  timeline: 'pm',
  architecture: 'developer',
  technologyStack: 'developer',
  umlDiagram: 'developer',
  erDiagram: 'developer',
  marketingStrategy: 'marketing',
  agentContributions: 'mediator',
  finalRecommendations: 'mediator'
};

// Sections each agent generates via AI. agentContributions is excluded:
// it is always composed locally by the Mediator, never AI-generated.
export const AGENT_ROLES = {
  ceo: ['executiveSummary', 'targetUsers', 'businessModel', 'budgetCostEstimate', 'risksMitigation'],
  pm: ['problemStatement', 'proposedSolution', 'mvpScope', 'keyFeatures', 'productRoadmap', 'timeline'],
  developer: ['architecture', 'technologyStack', 'umlDiagram', 'erDiagram'],
  marketing: ['marketingStrategy'],
  mediator: ['finalRecommendations']
};
