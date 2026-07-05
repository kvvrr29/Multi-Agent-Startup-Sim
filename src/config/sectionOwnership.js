export const SECTION_OWNERSHIP = {
  executiveSummary: 'ceo',
  businessModel: 'ceo',
  problemStatement: 'pm',
  productRoadmap: 'pm',
  architecture: 'developer',
  umlDiagram: 'developer',
  erDiagram: 'developer',
  marketingStrategy: 'marketing'
};

export const AGENT_ROLES = {
  ceo: ['executiveSummary', 'businessModel'],
  pm: ['problemStatement', 'productRoadmap'],
  developer: ['architecture', 'umlDiagram', 'erDiagram'],
  marketing: ['marketingStrategy']
};
