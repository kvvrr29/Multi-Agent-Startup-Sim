// ── 3-stage AI response validation with scoring (doc §1) ────────────────────
// Stage 1: Structural  — parseable, complete, non-empty, safe
// Stage 2: Agent-specific — content matches the agent's responsibility
// Stage 3: Domain relevance — content matches the project, per-agent rules
//
// Pure functions: no store access, fully unit-testable.

import { getProviderProfile, CLOUD_THRESHOLDS } from './providerProfiles';

const MIN_SECTION_LENGTH = 50;
const BANNED_PHRASES = ['lorem ipsum', 'as an ai'];
const SAAS_BUZZWORDS = ['freemium', 'white-label', 'invite only beta'];
// Kept as the default gates so every existing caller behaves exactly as before.
// Provider-specific gates arrive through the profile (see providerProfiles.js).
const VALIDATION_THRESHOLDS = CLOUD_THRESHOLDS;

const DECISION_CATEGORIES = ['Business', 'Product', 'Technical', 'Marketing', 'Scope'];
const AGENT_DECISION_CATEGORIES = {
  ceo: ['Business', 'Scope'],
  pm: ['Product', 'Scope'],
  developer: ['Technical', 'Scope'],
  marketing: ['Marketing', 'Scope'],
  mediator: DECISION_CATEGORIES
};

// Concept groups per agent (doc §1 Stage 2). Each group is a synonym list;
// the group counts as matched when any synonym appears in the combined text.
const AGENT_CONCEPT_GROUPS = {
  ceo: [
    ['business model', 'revenue model', 'monetization', 'monetisation'],
    ['revenue', 'income', 'sales'],
    ['pricing', 'price', 'fee', 'commission', 'subscription'],
    ['market', 'opportunity', 'demand', 'segment'],
    ['budget', 'funding', 'investment'],
    ['cost', 'expense', 'spend'],
    ['risk', 'threat', 'churn', 'competition'],
    ['viability', 'sustainab', 'profitab', 'margin', 'growth']
  ],
  pm: [
    ['problem', 'pain point', 'frustration', 'struggle'],
    ['scope', 'in scope', 'out of scope', 'boundary'],
    ['feature', 'capability', 'functionality'],
    ['mvp', 'minimum viable', 'initial version', 'first version'],
    ['priorit', 'phase', 'milestone'],
    ['user', 'customer', 'requirement', 'workflow', 'story'],
    ['roadmap', 'timeline', 'plan']
  ],
  developer: [
    ['architecture', 'microservice', 'monolith', 'service', 'gateway'],
    ['technology', 'tech stack', 'framework', 'node', 'python', 'react', 'java', '.net', 'fastapi', 'spring'],
    ['database', 'postgres', 'mysql', 'mongodb', 'sql', 'redis', 'schema'],
    ['api', 'endpoint', 'rest', 'graphql', 'websocket'],
    ['module', 'component', 'layer'],
    ['data flow', 'request', 'pipeline', 'queue', 'event', 'graph td', 'erdiagram', 'classdiagram'],
    ['scalab', 'infrastructure', 'cloud', 'deploy', 'docker', 'kubernetes', 'hosting']
  ],
  marketing: [
    ['audience', 'target', 'segment', 'demographic'],
    ['positioning', 'brand', 'messaging', 'value proposition'],
    ['acquisition', 'acquire', 'onboard', 'conversion', 'funnel'],
    ['channel', 'social media', 'seo', 'content marketing', 'ads', 'influencer', 'email'],
    ['campaign', 'promotion', 'launch'],
    ['growth', 'viral', 'referral', 'retention', 'community']
  ],
  mediator: [
    ['recommend', 'suggest', 'advise', 'next step'],
    ['priorit', 'first', 'before', 'sequence', 'focus'],
    ['validate', 'test', 'measure', 'verify', 'milestone']
  ]
};

// Per-section concept groups, used when a response covers exactly one section
// (the per-section strategy). Scoring a lone section against the agent's whole
// responsibility list would fail it for concepts it was never asked to cover.
//
// Each section is split into four groups rather than one. With a single group
// the score could only ever be 0 or 100, which made every agentRelevance
// threshold between 1 and 100 behave identically — the gate existed but could
// not be tuned. Four groups give it 25-point resolution, so a threshold of 60
// means "covered three of the four things this section is actually about" and
// a section that only restates its own title no longer scores full marks.
//
// The first synonym of each group is what the local prompt lists back to the
// model as the concepts to cover, so groups are written as the definition of a
// complete section, not as keyword bait.
export const SECTION_CONCEPT_GROUPS = {
  executiveSummary: [
    ['problem', 'need', 'gap', 'challenge', 'pain'],
    ['solution', 'product', 'platform', 'service', 'offering', 'app'],
    ['customer', 'user', 'audience', 'market', 'segment'],
    ['value', 'benefit', 'advantage', 'differentiat', 'opportunit', 'growth']
  ],
  targetUsers: [
    ['user', 'audience', 'customer', 'segment', 'persona'],
    ['demographic', 'age', 'student', 'professional', 'income', 'location', 'urban', 'region'],
    ['need', 'pain', 'problem', 'motivation', 'goal', 'frustration'],
    ['behaviour', 'behavior', 'habit', 'usage', 'adopt', 'journey', 'spend', 'frequen']
  ],
  businessModel: [
    ['revenue', 'monetization', 'monetisation', 'income'],
    ['pricing', 'price', 'subscription', 'fee', 'commission', 'tier', 'freemium', 'plan'],
    ['cost', 'margin', 'expense', 'unit econom', 'profitab'],
    ['customer', 'segment', 'channel', 'partner', 'acquisition', 'retention']
  ],
  budgetCostEstimate: [
    ['budget', 'cost', 'expense', 'spend', 'funding'],
    ['salary', 'team', 'hire', 'personnel', 'staff', 'developer', 'engineer'],
    ['infrastructure', 'hosting', 'cloud', 'server', 'tool', 'license', 'software', 'domain'],
    ['total', 'estimate', 'month', 'year', '$', 'usd', 'runway', 'allocat', 'contingenc']
  ],
  risksMitigation: [
    ['risk', 'threat', 'challenge', 'concern'],
    ['mitigat', 'reduce', 'address', 'prevent', 'contingen', 'counter'],
    ['competit', 'market', 'adoption', 'regulat', 'legal', 'privacy', 'security', 'compliance'],
    ['technical', 'scal', 'depend', 'operational', 'financial', 'churn', 'delay']
  ],

  problemStatement: [
    ['problem', 'pain', 'frustration', 'struggle', 'difficulty', 'gap'],
    ['current', 'today', 'existing', 'traditional', 'manual', 'alternative'],
    ['user', 'customer', 'people', 'business', 'owner', 'team'],
    ['impact', 'cost', 'time', 'waste', 'lose', 'inefficien', 'consequence', 'revenue']
  ],
  proposedSolution: [
    ['solution', 'platform', 'system', 'service', 'application', 'product'],
    ['solve', 'address', 'enable', 'allow', 'provide', 'deliver', 'automat', 'streamline'],
    ['user', 'customer', 'workflow', 'experience'],
    ['differ', 'unlike', 'advantage', 'better', 'unique', 'instead', 'compared']
  ],
  mvpScope: [
    ['mvp', 'minimum viable', 'first version', 'initial release', 'core'],
    ['in scope', 'include', 'deliver', 'must have', 'build'],
    ['out of scope', 'exclude', 'later', 'not include', 'defer', 'future', 'post-mvp'],
    ['user', 'feature', 'goal', 'success', 'validat', 'assumption']
  ],
  keyFeatures: [
    ['feature', 'capabilit', 'functionalit'],
    ['user', 'allow', 'enable', 'lets', 'can '],
    ['search', 'dashboard', 'notification', 'payment', 'profile', 'tracking', 'recommend', 'report', 'upload', 'chat', 'schedul', 'filter'],
    ['priorit', 'core', 'essential', 'phase', 'must', 'differentiat']
  ],
  productRoadmap: [
    ['roadmap', 'phase', 'stage', 'quarter', 'release', 'version'],
    ['launch', 'ship', 'deliver', 'rollout', 'beta', 'pilot'],
    ['feature', 'capabilit', 'expand', 'scale', 'improve', 'integrat'],
    ['month', 'quarter', 'year', 'short term', 'long term', 'timeline', 'horizon']
  ],
  timeline: [
    ['timeline', 'schedule', 'phase', 'milestone'],
    ['week', 'month', 'day', 'sprint', 'quarter'],
    ['design', 'develop', 'build', 'test', 'deploy', 'launch', 'research'],
    ['deliver', 'complete', 'duration', 'start', 'parallel', 'dependenc']
  ],

  architecture: [
    ['architecture', 'microservice', 'monolith', 'layer', 'tier', 'component'],
    ['api', 'gateway', 'endpoint', 'rest', 'graphql', 'service'],
    ['database', 'storage', 'cache', 'queue', 'schema', 'data flow'],
    ['scalab', 'infrastructure', 'cloud', 'deploy', 'availab', 'security', 'load']
  ],
  technologyStack: [
    ['frontend', 'client', 'react', 'vue', 'angular', 'next', 'flutter', 'mobile', 'ui'],
    ['backend', 'server', 'api', 'node', 'python', 'java', 'django', 'fastapi', 'spring', 'express', 'rails'],
    ['database', 'postgres', 'mysql', 'mongodb', 'sql', 'redis', 'storage'],
    ['deploy', 'host', 'cloud', 'aws', 'docker', 'kubernetes', 'vercel', 'infrastructure', 'ci/cd']
  ],
  umlDiagram: [
    ['user', 'actor', 'role', 'admin'],
    ['use case', 'flow', 'interaction', 'scenario', 'action'],
    ['system', 'component', 'class', 'module', 'boundary'],
    ['diagram', 'uml', 'graph', 'sequence', 'relationship']
  ],
  erDiagram: [
    ['entity', 'table', 'record'],
    ['relationship', 'one-to-many', 'many-to-many', 'links', 'references', 'belongs'],
    ['attribute', 'field', 'column', 'primary key', 'foreign key', 'id'],
    ['database', 'schema', 'diagram', 'data model', 'normal']
  ],

  marketingStrategy: [
    ['audience', 'target', 'segment', 'persona'],
    ['channel', 'social media', 'seo', 'content', 'ads', 'email', 'influencer', 'community', 'app store'],
    ['campaign', 'launch', 'promotion', 'messaging', 'brand', 'positioning', 'value proposition'],
    ['acquisition', 'conversion', 'funnel', 'retention', 'growth', 'referral', 'metric', 'cac']
  ],
  finalRecommendations: [
    ['recommend', 'suggest', 'advise', 'should'],
    ['priorit', 'first', 'next step', 'immediate', 'focus'],
    ['validat', 'test', 'measure', 'metric', 'milestone', 'track'],
    ['risk', 'avoid', 'ensure', 'caution', 'watch', 'before']
  ]
};

// How Stage 3 weighs domain entities vs. general domain/industry terms per
// agent (doc §1 Stage 3: technical entities are NOT mandatory in marketing
// output; marketing terms are NOT mandatory in architecture output, etc.)
const DOMAIN_WEIGHTS = {
  ceo: { entities: 40, domainTerms: 60 },
  pm: { entities: 60, domainTerms: 40 },
  developer: { entities: 80, domainTerms: 20 },
  marketing: { entities: 30, domainTerms: 70 },
  mediator: { entities: 30, domainTerms: 70 }
};

const tokenize = (str) =>
  (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 3);

// ── Stage 1: Structural ──────────────────────────────────────────────────────

export const validateStructure = (data, expectedSections, { minSectionLength = MIN_SECTION_LENGTH } = {}) => {
  const issues = [];
  let checks = 0;
  let passedChecks = 0;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { score: 0, ok: false, issues: ['Response is not a JSON object.'] };
  }

  expectedSections.forEach(section => {
    checks += 3;
    const value = data[section];

    if (value === undefined || value === null || typeof value !== 'string') {
      issues.push(`Section "${section}" is missing or not a string.`);
      return;
    }
    passedChecks += 1;

    if (value.trim().length < minSectionLength) {
      issues.push(`Section "${section}" is too short (needs at least ${minSectionLength} characters of useful content).`);
    } else {
      passedChecks += 1;
    }

    const lower = value.toLowerCase();
    const banned = BANNED_PHRASES.find(p => lower.includes(p));
    if (banned) {
      issues.push(`Section "${section}" contains placeholder/filler text ("${banned}").`);
    } else {
      passedChecks += 1;
    }
  });

  const score = checks === 0 ? 100 : Math.round((passedChecks / checks) * 100);
  return { score, ok: issues.length === 0, issues };
};

// ── Stage 2: Agent-specific relevance ────────────────────────────────────────

export const validateAgentRelevance = (combinedText, agentRole, { expectedSections = [], threshold = VALIDATION_THRESHOLDS.agentRelevance } = {}) => {
  // When the response covers a known subset of sections, score against those
  // sections' concepts instead of the agent's full remit.
  let groups = expectedSections.flatMap(section => SECTION_CONCEPT_GROUPS[section] || []);
  if (groups.length === 0) groups = AGENT_CONCEPT_GROUPS[agentRole] || [];

  if (groups.length === 0) {
    return { score: 100, issues: [], missingConcepts: [] };
  }

  const lower = combinedText.toLowerCase();
  const missingConcepts = [];
  let matched = 0;

  groups.forEach(group => {
    if (group.some(synonym => lower.includes(synonym))) {
      matched += 1;
    } else {
      missingConcepts.push(group[0]);
    }
  });

  const score = Math.round((matched / groups.length) * 100);
  const issues = [];
  if (score < threshold) {
    issues.push(`Content does not cover the ${agentRole.toUpperCase()} agent's core responsibilities. Missing concepts: ${missingConcepts.join(', ')}.`);
  }
  return { score, issues, missingConcepts };
};

// ── Stage 3: Domain relevance (per-agent expectations) ───────────────────────

export const validateDomainRelevance = (combinedText, agentRole, domain = '', industry = '', mandatoryKeywords = [], { enforceCriticals = true } = {}) => {
  const issues = [];
  const lower = combinedText.toLowerCase();
  const weights = DOMAIN_WEIGHTS[agentRole] || DOMAIN_WEIGHTS.mediator;

  // Nothing to evaluate against (e.g. classifier failed) — do not punish.
  const domainTokens = [...tokenize(domain), ...tokenize(industry)];
  if (mandatoryKeywords.length === 0 && domainTokens.length === 0) {
    return { score: 100, issues: [] };
  }

  // Entity coverage
  let entityScore = 100;
  let matchedEntities = [];
  if (mandatoryKeywords.length > 0) {
    matchedEntities = mandatoryKeywords.filter(kw => lower.includes(kw.toLowerCase()));
    entityScore = Math.round((matchedEntities.length / mandatoryKeywords.length) * 100);
    if (agentRole === 'developer' && matchedEntities.length === 0) {
      issues.push(`Technical output must model the project's core domain entities (${mandatoryKeywords.join(', ')}) but none appear.`);
    }
  }

  // Domain / industry terminology presence
  let domainTermScore = 100;
  if (domainTokens.length > 0) {
    domainTermScore = domainTokens.some(t => lower.includes(t)) ? 100 : 0;
  }

  let score = Math.round(
    (entityScore * weights.entities + domainTermScore * weights.domainTerms) / 100
  );

  // Generic-SaaS penalty: only business/marketing content, only non-SaaS domains.
  const isGenericSaaS = domain.toLowerCase().includes('saas') || domain.toLowerCase().includes('general');
  if (!isGenericSaaS && (agentRole === 'ceo' || agentRole === 'marketing')) {
    const buzzword = SAAS_BUZZWORDS.find(b => lower.includes(b));
    if (buzzword && !lower.includes('specifically tailored')) {
      score = Math.max(0, score - 25);
      issues.push(`Content assumes a generic SaaS model ("${buzzword}") which does not fit the ${domain || 'detected'} domain.`);
    }
  }

  if (score < 40) {
    issues.push(`Content is not specific enough to the project domain (${domain || 'unknown'}${industry ? ` / ${industry}` : ''}). Reference its actual entities and terminology.`);
  }

  return {
    score,
    issues,
    // A small local model states entities semantically rather than verbatim, so
    // this hard fail is disabled for it (see providerProfiles.js).
    criticalIssues: enforceCriticals && agentRole === 'developer' && mandatoryKeywords.length > 0 && matchedEntities.length === 0
      ? [`Developer output is missing every mandatory technical entity: ${mandatoryKeywords.join(', ')}.`]
      : []
  };
};

const validateDecisions = (decisions, agentRole) => {
  if (decisions === undefined) return { decisions: [], issues: [] };
  if (!Array.isArray(decisions)) {
    return { decisions: [], issues: ['Decisions were ignored because they are not an array.'] };
  }

  const allowed = AGENT_DECISION_CATEGORIES[agentRole] || DECISION_CATEGORIES;
  const issues = [];
  const valid = [];
  decisions.forEach((decision, index) => {
    const structurallyValid = decision && typeof decision === 'object' && !Array.isArray(decision)
      && ['category', 'key', 'value', 'rationale'].every(key => typeof decision[key] === 'string' && decision[key].trim());
    if (!structurallyValid) {
      issues.push(`Decision ${index + 1} was ignored because it is malformed.`);
      return;
    }
    if (!DECISION_CATEGORIES.includes(decision.category) || !allowed.includes(decision.category)) {
      issues.push(`Decision ${index + 1} was ignored because category "${decision.category}" is not authorized for ${agentRole || 'this agent'}.`);
      return;
    }
    valid.push({
      category: decision.category,
      key: decision.key.trim(),
      value: decision.value.trim(),
      rationale: decision.rationale.trim()
    });
  });
  return { decisions: valid, issues };
};

// ── Combined validator ───────────────────────────────────────────────────────

/**
 * Validates a raw AI response through all three stages.
 * Returns { passed, scores: {structural, agentRelevance, domainRelevance, overall}, issues, content, decisions }.
 * Never throws on content problems — only `passed: false` with issues.
 */
export const validateAIResponse = (responseText, expectedSections = [], { agentRole = '', domain = '', industry = '', mandatoryKeywords = [], providerName = 'gemini' } = {}) => {
  const profile = getProviderProfile(providerName);
  const thresholds = profile.thresholds;

  let data;
  try {
    data = extractJson(responseText);
  } catch {
    return {
      passed: false,
      scores: { structural: 0, agentRelevance: 0, domainRelevance: 0, overall: 0 },
      stages: {
        structural: { status: 'failed', score: 0 },
        agentRelevance: { status: 'failed', score: 0 },
        domainRelevance: { status: 'failed', score: 0 }
      },
      issues: ['Response is not valid JSON.'],
      content: {},
      decisions: []
    };
  }

  const structural = validateStructure(data, expectedSections, { minSectionLength: profile.minSectionLength });

  const combinedText = expectedSections
    .map(s => (typeof data?.[s] === 'string' ? data[s] : ''))
    .join(' ');

  // Section-scoped scoring only applies when the response is one section at a
  // time; a batch response is still judged against the agent's whole remit.
  const agent = validateAgentRelevance(combinedText, agentRole, {
    expectedSections: profile.strategy === 'perSection' ? expectedSections : [],
    threshold: thresholds.agentRelevance
  });
  const domainRes = validateDomainRelevance(combinedText, agentRole, domain, industry, mandatoryKeywords, {
    enforceCriticals: profile.enforceDomainCriticals
  });

  const overall = Math.round(
    structural.score * 0.4 + agent.score * 0.3 + domainRes.score * 0.3
  );

  const domainThreshold = agentRole === 'developer'
    ? thresholds.developerDomainRelevance
    : thresholds.domainRelevance;
  const stagePass = {
    structural: structural.ok && structural.score === thresholds.structural,
    agentRelevance: agent.score >= thresholds.agentRelevance,
    domainRelevance: domainRes.score >= domainThreshold && !(domainRes.criticalIssues?.length)
  };
  const passed = Object.values(stagePass).every(Boolean) && overall >= thresholds.overall;
  const decisionsResult = validateDecisions(data?.decisions, agentRole);
  const issues = [...structural.issues, ...agent.issues, ...domainRes.issues, ...(domainRes.criticalIssues || []), ...decisionsResult.issues];
  if (!passed && issues.length === 0) {
    issues.push(`One or more validation gates failed (overall ${overall}%).`);
  }

  const content = {};
  expectedSections.forEach(section => {
    if (typeof data?.[section] === 'string') content[section] = data[section];
  });

  return {
    passed,
    scores: {
      structural: structural.score,
      agentRelevance: agent.score,
      domainRelevance: domainRes.score,
      overall
    },
    stages: {
      structural: { status: stagePass.structural ? 'passed' : 'failed', score: structural.score, threshold: thresholds.structural },
      agentRelevance: { status: stagePass.agentRelevance ? 'passed' : 'failed', score: agent.score, threshold: thresholds.agentRelevance },
      domainRelevance: { status: stagePass.domainRelevance ? 'passed' : 'failed', score: domainRes.score, threshold: domainThreshold }
    },
    issues,
    content,
    decisions: decisionsResult.decisions,
    decisionIssues: decisionsResult.issues
  };
};

/**
 * Parses a model response into an object.
 *
 * Well-behaved models return bare JSON. Smaller ones wrap it in ```json fences
 * or add a sentence of preamble, which is a formatting quirk rather than a
 * content failure — so we retry on a fenced block, then on the outermost
 * brace pair, before giving up. Throws when nothing parses.
 */
export const extractJson = (responseText) => {
  const raw = (responseText || '').trim();
  try {
    return JSON.parse(raw);
  } catch (initialErr) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidates = [];
    if (fenced) candidates.push(fenced[1].trim());

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1).trim());

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try the next candidate
      }
    }
    throw initialErr;
  }
};

/**
 * Builds the targeted retry feedback the doc requires (§2): explain the exact
 * issue, ask to improve only the missing areas.
 */
export const buildRetryFeedback = (validation) => {
  const { scores, issues } = validation;
  const structuralOk = scores.structural === 100;
  const intro = structuralOk
    ? 'Your previous response was structurally valid but lacked project-specific detail.'
    : 'Your previous response had structural problems.';
  return `${intro}\nExact issues found:\n${issues.map(i => `- ${i}`).join('\n')}\nImprove only the missing areas while preserving the useful content. Do not change what was already correct.`;
};

/**
 * Builds the response schema in the dialect the target provider expects.
 *
 * Gemini's responseSchema uses its own uppercase Type enum; OpenAI and WebLLM
 * expect standard lowercase JSON Schema. Emitting the wrong casing is silently
 * ignored by the model and produces unstructured output, so the dialect is
 * driven by the provider profile rather than guessed.
 */
export const createResponseSchema = (sectionKeys, { dialect = 'gemini' } = {}) => {
  const gemini = dialect === 'gemini';
  const T = {
    string: gemini ? 'STRING' : 'string',
    array: gemini ? 'ARRAY' : 'array',
    object: gemini ? 'OBJECT' : 'object'
  };

  const properties = {};
  sectionKeys.forEach(key => {
    properties[key] = {
      type: T.string,
      description: `The markdown content for the ${key} section. Must be detailed and professional. Must not be empty.`
    };
  });

  properties.decisions = {
    type: T.array,
    description: "A list of 1-3 structured decisions. Use only a category authorized for the agent.",
    items: {
      type: T.object,
      properties: {
        category: { type: T.string, enum: DECISION_CATEGORIES },
        key: { type: T.string },
        value: { type: T.string },
        rationale: { type: T.string }
      },
      required: ["category", "key", "value", "rationale"]
    }
  };

  return {
    type: T.object,
    properties,
    // Small models drop optional keys under token pressure; forcing `decisions`
    // there turns a usable section into a hard failure.
    required: gemini ? [...sectionKeys, "decisions"] : [...sectionKeys]
  };
};
