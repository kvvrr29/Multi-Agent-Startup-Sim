export const CLOUD_THRESHOLDS = {
  structural: 100,
  agentRelevance: 60,
  domainRelevance: 60,
  developerDomainRelevance: 70,
  overall: 70
};
export const LOCAL_THRESHOLDS = {
  structural: 100,
  agentRelevance: 60,
  domainRelevance: 60,
  developerDomainRelevance: 30,
  overall: 70
};

const CLOUD_PROFILE = {
  strategy: 'batch',
  schemaDialect: 'gemini',
  thresholds: CLOUD_THRESHOLDS,
  minSectionLength: 50,
  minWords: null,
  minParagraphs: null,
  enforceDomainCriticals: true,
  templateDiagrams: false,
  jsonHardening: false,
  maxTokens: null
};

const LOCAL_PROFILE = {
  strategy: 'perSection',
  schemaDialect: 'jsonSchema',
  thresholds: LOCAL_THRESHOLDS,
  minSectionLength: 600,
  minWords: 350,
  minParagraphs: 4,
  enforceDomainCriticals: false,
  templateDiagrams: true,
  jsonHardening: true,
  maxTokens: 1800
};
const PROFILES = {
  gemini: CLOUD_PROFILE,
  openai: { ...CLOUD_PROFILE, schemaDialect: 'jsonSchema' },
  webllm: LOCAL_PROFILE
};

export const getProviderProfile = (providerName) =>
  PROFILES[providerName] || CLOUD_PROFILE;
export const LOCAL_CONTEXT_WINDOW = 8192;
const PROMPT_OVERHEAD_TOKENS = 900;
export const getMaxContextTokens = (profile, sectionMaxTokens) =>
  profile.maxTokens === null
    ? null
    : LOCAL_CONTEXT_WINDOW - (sectionMaxTokens || profile.maxTokens) - PROMPT_OVERHEAD_TOKENS;
export const SECTION_MAX_TOKENS = {
  executiveSummary: 1300,
  targetUsers: 1200,
  businessModel: 1300,
  budgetCostEstimate: 1200,
  risksMitigation: 1300,
  problemStatement: 1200,
  proposedSolution: 1300,
  mvpScope: 1300,
  keyFeatures: 1400,
  productRoadmap: 1300,
  timeline: 1200,
  architecture: 1400,
  technologyStack: 1200,
  umlDiagram: 1200,
  erDiagram: 1200,
  marketingStrategy: 1300,
  finalRecommendations: 1300
};

export const getSectionMaxTokens = (sectionKey, profile) =>
  profile.maxTokens === null ? null : (SECTION_MAX_TOKENS[sectionKey] || profile.maxTokens);

export const DIAGRAM_SECTIONS = ['architecture', 'umlDiagram', 'erDiagram'];
