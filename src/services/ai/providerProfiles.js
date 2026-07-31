// ── Per-provider generation profiles ─────────────────────────────────────────
//
// A frontier cloud model and a 0.5B model running in the browser cannot be held
// to the same contract. Rather than scattering `if (isWebLLM)` checks through
// the factory and the validator, every provider-dependent knob lives here:
//
//   strategy        how the factory asks for content (one call vs per section)
//   schemaDialect   Gemini's Type enum vs standard JSON Schema
//   thresholds      the validation gates a response must clear
//   templateDiagrams  substitute hand-written mermaid instead of asking
//
// The cloud profile reproduces the original single-provider behaviour exactly,
// so nothing about the Gemini path changes.

/** Gates tuned for frontier models. These are the original project defaults. */
export const CLOUD_THRESHOLDS = {
  structural: 100,
  agentRelevance: 60,
  domainRelevance: 60,
  developerDomainRelevance: 70,
  overall: 70
};

/**
 * Gates tuned for a ~0.5B browser model. Deliberately permissive: at this size
 * the realistic choice is "usable but thin" or "nothing at all". Structural
 * validity is still enforced at 100 — malformed JSON never passes.
 */
export const LOCAL_THRESHOLDS = {
  structural: 100,
  agentRelevance: 15,
  domainRelevance: 20,
  developerDomainRelevance: 25,
  overall: 40
};

const CLOUD_PROFILE = {
  strategy: 'batch',
  schemaDialect: 'gemini',
  thresholds: CLOUD_THRESHOLDS,
  minSectionLength: 50,
  // Small models rarely name every mandatory entity verbatim; large ones should.
  enforceDomainCriticals: true,
  templateDiagrams: false,
  // Gemini and OpenAI enforce structure through their APIs; the reminder would
  // just be noise in their prompts.
  jsonHardening: false,
  maxTokens: null
};

const LOCAL_PROFILE = {
  strategy: 'perSection',
  schemaDialect: 'jsonSchema',
  thresholds: LOCAL_THRESHOLDS,
  minSectionLength: 25,
  enforceDomainCriticals: false,
  templateDiagrams: true,
  // Nothing enforces JSON here, so the prompt has to ask for it explicitly.
  jsonHardening: true,
  maxTokens: 1500
};

// OpenAI uses standard JSON Schema but is otherwise a frontier model, so it
// keeps the strict gates and the single-call strategy.
const PROFILES = {
  gemini: CLOUD_PROFILE,
  openai: { ...CLOUD_PROFILE, schemaDialect: 'jsonSchema' },
  webllm: LOCAL_PROFILE
};

export const getProviderProfile = (providerName) =>
  PROFILES[providerName] || CLOUD_PROFILE;

/**
 * Output budget per section for the per-section strategy. Prose sections get
 * room to breathe; diagrams are short but must not be truncated mid-syntax.
 */
export const SECTION_MAX_TOKENS = {
  executiveSummary: 700,
  targetUsers: 600,
  businessModel: 700,
  budgetCostEstimate: 600,
  risksMitigation: 700,
  problemStatement: 600,
  proposedSolution: 700,
  mvpScope: 700,
  keyFeatures: 700,
  productRoadmap: 700,
  timeline: 600,
  architecture: 900,
  technologyStack: 600,
  umlDiagram: 500,
  erDiagram: 500,
  marketingStrategy: 700,
  finalRecommendations: 700
};

export const getSectionMaxTokens = (sectionKey, profile) =>
  profile.maxTokens === null ? null : (SECTION_MAX_TOKENS[sectionKey] || profile.maxTokens);

export const DIAGRAM_SECTIONS = ['architecture', 'umlDiagram', 'erDiagram'];
