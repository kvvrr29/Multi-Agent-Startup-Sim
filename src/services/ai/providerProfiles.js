// ── Per-provider generation profiles ─────────────────────────────────────────
//
// A frontier cloud model and a small model in the browser cannot be held to the
// same contract. Rather than scattering `if (isWebLLM)` checks through the
// factory and the validator, every provider-dependent knob lives here:
//
//   strategy          how the factory asks for content (one call vs per section)
//   schemaDialect     Gemini's Type enum vs standard JSON Schema
//   thresholds        the validation gates a response must clear
//   templateDiagrams  substitute hand-written mermaid instead of asking

/** Gates tuned for frontier models. These are the original project defaults. */
export const CLOUD_THRESHOLDS = {
  structural: 100,
  agentRelevance: 60,
  domainRelevance: 60,
  developerDomainRelevance: 70,
  overall: 70
};

/**
 * Gates for the browser model, matching cloud wherever the scoring maths makes
 * that reachable: a failed gate here only costs a retry (the per-section loop
 * keeps the best-effort text either way), where cloud throws to the template
 * factory. developerDomainRelevance is the exception — it weights entities at
 * 80% and terminology at 20%, so a Technology Stack section naming React and
 * Postgres but no project entity caps out at 20. 30 is the lowest value that
 * still demands at least one entity.
 */
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
  // ~600 characters is roughly 100 words — well under the 350 the prompt asks
  // for, so a merely brisk answer is not rejected, but far enough above a
  // paragraph that anything failing it is genuinely thin and worth one retry.
  minSectionLength: 600,
  // A small instruct model writes one line unless told otherwise. This is the
  // only place a length is ever stated to it.
  minWords: 350,
  minParagraphs: 4,
  enforceDomainCriticals: false,
  templateDiagrams: true,
  // Nothing enforces JSON here, so the prompt has to ask for it explicitly.
  jsonHardening: true,
  maxTokens: 1800
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

// The window the local engine is loaded with, and the one contextBuilder
// budgets against — sharing it means the two cannot disagree. Qwen2.5 is
// trained for 32768; web-llm's prebuilt entry pins 4096 for every model size,
// a phone-sized default. Raising it costs KV cache VRAM (~56 KiB/token) only.
export const LOCAL_CONTEXT_WINDOW = 8192;

// Room for the system prompt and task block that follow the context, plus slack
// for the 4-chars-per-token estimate being wrong. Overflowing the window is a
// hard engine error, so this errs high.
const PROMPT_OVERHEAD_TOKENS = 900;

// How many tokens of context the model can be given, once its answer is
// accounted for. Cloud providers get null — they are not budgeted.
export const getMaxContextTokens = (profile, sectionMaxTokens) =>
  profile.maxTokens === null
    ? null
    : LOCAL_CONTEXT_WINDOW - (sectionMaxTokens || profile.maxTokens) - PROMPT_OVERHEAD_TOKENS;

/**
 * Output budget per section for the per-section strategy. These bound
 * worst-case generation time and stop a small model looping, and are
 * deliberately generous — hitting the ceiling truncates the JSON mid-string,
 * which no parser can repair, so an unused token beats a retry. A 350-word
 * section is ~470 tokens before markdown and JSON escaping, hence roughly
 * three times the target.
 */
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
