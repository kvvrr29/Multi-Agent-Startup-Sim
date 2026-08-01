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
 * Gates for the browser model. These now match the cloud gates everywhere the
 * scoring maths makes that reachable, because a failed gate here is not the
 * same event as a failed gate on cloud: cloud throws and falls back to the
 * template factory, while the per-section loop retries once and then keeps the
 * best-effort text either way. Raising a local gate can therefore cost an extra
 * call, but it can never cost a section — which is what made the old, very
 * permissive numbers unnecessary.
 *
 * developerDomainRelevance is the one exception. Its scoring weights entities
 * at 80% and domain terminology at 20%, so a Technology Stack section naming
 * React and Postgres but not one project entity caps out at 20. 30 is the
 * lowest value that still requires at least one entity to appear.
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

/**
 * The context window the local engine is loaded with. Qwen2.5 is trained for
 * 32768; web-llm's prebuilt entry pins 4096 for every model size, which is a
 * default sized for phones rather than a property of the model. Raising it
 * costs KV cache VRAM (~56 KiB per token) and nothing else.
 *
 * ModelManager loads the engine with this and contextBuilder budgets against
 * it, so the two cannot disagree about how much room there is.
 */
export const LOCAL_CONTEXT_WINDOW = 8192;

// Room kept aside for the system prompt and the task block that follow the
// context, plus slack for the difference between the 4-chars-per-token estimate
// and the real tokenizer. Overflowing the window is a hard engine error, so
// this errs high.
const PROMPT_OVERHEAD_TOKENS = 900;

/**
 * How many tokens of context the model can be given, once its answer is
 * accounted for. Cloud providers get null — they are not budgeted, and the
 * context they receive is unchanged.
 */
export const getMaxContextTokens = (profile, sectionMaxTokens) =>
  profile.maxTokens === null
    ? null
    : LOCAL_CONTEXT_WINDOW - (sectionMaxTokens || profile.maxTokens) - PROMPT_OVERHEAD_TOKENS;

/**
 * Output budget per section for the per-section strategy.
 *
 * These bound worst-case generation time and stop a small model looping. They
 * are deliberately generous: hitting the ceiling truncates the JSON mid-string,
 * which no parser can repair, so an unused token is far cheaper than a retry.
 *
 * The ceiling is the context window, not the card. web-llm pins 4096 tokens for
 * every Qwen2.5 size, and the compact prompt costs ~600 tokens (~1400 when a
 * long section is pinned in for a revision), so 1400 out still leaves headroom.
 * A 350-word section is ~470 tokens of prose before markdown and JSON escaping,
 * which is why these sit at roughly three times the target.
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
