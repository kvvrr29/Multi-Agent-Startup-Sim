// ── Per-provider generation profiles ─────────────────────────────────────────
//
// A frontier cloud model and a small model running in the browser cannot be held
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
 * Gates tuned for a small (~1.5B) browser model. Deliberately permissive: at
 * this size the realistic choice is "usable but thin" or "nothing at all".
 * Structural validity is still enforced at 100 — malformed JSON never passes.
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
  // Frontier models are verbose by default and the batch prompt already asks
  // for "detailed" output, so no explicit target is needed.
  minWords: null,
  minParagraphs: null,
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
  // ~150 characters is roughly 25 words: below that the model has answered in a
  // sentence and a retry is worth the call. It stays well under the ~200 words
  // the prompt asks for, so ordinary short-but-real answers are not rejected.
  minSectionLength: 150,
  // A small instruct model writes one line unless told otherwise. This is the
  // only place a length is ever stated to it.
  minWords: 200,
  minParagraphs: 3,
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
 * Output budget per section for the per-section strategy.
 *
 * These bound worst-case generation time and stop a small model looping. They
 * are deliberately generous: hitting the ceiling truncates the JSON mid-string,
 * which no parser can repair, so an unused token is far cheaper than a retry.
 */
export const SECTION_MAX_TOKENS = {
  executiveSummary: 800,
  targetUsers: 700,
  businessModel: 800,
  budgetCostEstimate: 700,
  risksMitigation: 800,
  problemStatement: 700,
  proposedSolution: 800,
  mvpScope: 800,
  keyFeatures: 900,
  productRoadmap: 800,
  timeline: 700,
  architecture: 1000,
  technologyStack: 700,
  umlDiagram: 800,
  erDiagram: 800,
  marketingStrategy: 800,
  finalRecommendations: 800
};

export const getSectionMaxTokens = (sectionKey, profile) =>
  profile.maxTokens === null ? null : (SECTION_MAX_TOKENS[sectionKey] || profile.maxTokens);

export const DIAGRAM_SECTIONS = ['architecture', 'umlDiagram', 'erDiagram'];
