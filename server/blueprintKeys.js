// Section ids for seeding blueprint_sections rows on project creation.
// Must stay in sync with src/config/blueprintSections.js (the client renders
// exactly these sections; extra/missing rows are ignored on hydrate).
export const BLUEPRINT_SECTION_KEYS = [
  'executiveSummary',
  'problemStatement',
  'proposedSolution',
  'targetUsers',
  'businessModel',
  'mvpScope',
  'keyFeatures',
  'productRoadmap',
  'architecture',
  'technologyStack',
  'umlDiagram',
  'erDiagram',
  'marketingStrategy',
  'budgetCostEstimate',
  'risksMitigation',
  'timeline',
  'agentContributions',
  'finalRecommendations'
];
