// ── 3-stage AI response validation with scoring (doc §1) ────────────────────
// Stage 1: Structural  — parseable, complete, non-empty, safe
// Stage 2: Agent-specific — content matches the agent's responsibility
// Stage 3: Domain relevance — content matches the project, per-agent rules
//
// Pure functions: no store access, fully unit-testable.

const MIN_SECTION_LENGTH = 50;
const BANNED_PHRASES = ['lorem ipsum', 'as an ai'];
const SAAS_BUZZWORDS = ['freemium', 'white-label', 'invite only beta'];
const PASS_THRESHOLD = 70;

// Concept groups per agent (doc §1 Stage 2). Each group is a synonym list;
// the group counts as matched when any synonym appears in the combined text.
export const AGENT_CONCEPT_GROUPS = {
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

export const validateStructure = (data, expectedSections) => {
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

    if (value.trim().length < MIN_SECTION_LENGTH) {
      issues.push(`Section "${section}" is too short (needs at least ${MIN_SECTION_LENGTH} characters of useful content).`);
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

export const validateAgentRelevance = (combinedText, agentRole) => {
  const groups = AGENT_CONCEPT_GROUPS[agentRole];
  if (!groups || groups.length === 0) {
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
  if (score < 50) {
    issues.push(`Content does not cover the ${agentRole.toUpperCase()} agent's core responsibilities. Missing concepts: ${missingConcepts.join(', ')}.`);
  }
  return { score, issues, missingConcepts };
};

// ── Stage 3: Domain relevance (per-agent expectations) ───────────────────────

export const validateDomainRelevance = (combinedText, agentRole, domain = '', industry = '', mandatoryKeywords = []) => {
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
  if (mandatoryKeywords.length > 0) {
    const matchedEntities = mandatoryKeywords.filter(kw => lower.includes(kw.toLowerCase()));
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

  return { score, issues };
};

// ── Combined validator ───────────────────────────────────────────────────────

/**
 * Validates a raw AI response through all three stages.
 * Returns { passed, scores: {structural, agentRelevance, domainRelevance, overall}, issues, content, decisions }.
 * Never throws on content problems — only `passed: false` with issues.
 */
export const validateAIResponse = (responseText, expectedSections = [], { agentRole = '', domain = '', industry = '', mandatoryKeywords = [] } = {}) => {
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    return {
      passed: false,
      scores: { structural: 0, agentRelevance: 0, domainRelevance: 0, overall: 0 },
      issues: ['Response is not valid JSON.'],
      content: {},
      decisions: []
    };
  }

  const structural = validateStructure(data, expectedSections);

  const combinedText = expectedSections
    .map(s => (typeof data?.[s] === 'string' ? data[s] : ''))
    .join(' ');

  const agent = validateAgentRelevance(combinedText, agentRole);
  const domainRes = validateDomainRelevance(combinedText, agentRole, domain, industry, mandatoryKeywords);

  const overall = Math.round(
    structural.score * 0.4 + agent.score * 0.3 + domainRes.score * 0.3
  );

  const passed = structural.ok && overall >= PASS_THRESHOLD;
  const issues = [...structural.issues, ...agent.issues, ...domainRes.issues];
  if (!passed && issues.length === 0) {
    issues.push(`Overall validation score ${overall}% is below the ${PASS_THRESHOLD}% threshold.`);
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
    issues,
    content,
    decisions: Array.isArray(data?.decisions) ? data.decisions : []
  };
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

export const createResponseSchema = (sectionKeys) => {
  const properties = {};
  sectionKeys.forEach(key => {
    properties[key] = {
      type: "STRING",
      description: `The markdown content for the ${key} section. Must be detailed and professional.`
    };
  });

  properties.decisions = {
    type: "ARRAY",
    description: "A list of 1-3 short strings summarizing the key strategic decisions made in this response.",
    items: { type: "STRING" }
  };

  return {
    type: "OBJECT",
    properties,
    required: [...sectionKeys, "decisions"]
  };
};
