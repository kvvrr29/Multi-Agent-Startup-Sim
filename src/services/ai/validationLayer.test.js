import { describe, it, expect } from 'vitest';
import {
  validateAIResponse,
  validateStructure,
  validateAgentRelevance,
  validateDomainRelevance,
  buildRetryFeedback
} from './validationLayer';

const HOSPITAL = { domain: 'HealthTech', industry: 'Healthcare', mandatoryKeywords: ['Patients', 'Doctors', 'Appointments'] };

const goodCeoHospital = JSON.stringify({
  executiveSummary: 'A B2B hospital management platform with tiered pricing per bed count. The market opportunity in regional healthcare is large, with revenue driven by annual contracts. Budget allocation prioritizes compliance. Key risks include long sales cycles; viability depends on pilot programs with doctors and patients.',
  decisions: [{ category: 'Business', key: 'pricing', value: 'Per-bed pricing', rationale: 'Matches hospital scale' }]
});

describe('Stage 1: structural validation', () => {
  it('fails on invalid JSON', () => {
    const res = validateAIResponse('not json {', ['executiveSummary'], { agentRole: 'ceo' });
    expect(res.passed).toBe(false);
    expect(res.scores.structural).toBe(0);
    expect(res.issues[0]).toMatch(/not valid JSON/);
  });

  it('fails on missing section', () => {
    const res = validateStructure({ other: 'x' }, ['executiveSummary']);
    expect(res.ok).toBe(false);
    expect(res.issues[0]).toMatch(/missing/);
  });

  it('fails on too-short content', () => {
    const res = validateStructure({ executiveSummary: 'short' }, ['executiveSummary']);
    expect(res.ok).toBe(false);
    expect(res.issues[0]).toMatch(/too short/);
  });

  it('fails on placeholder text', () => {
    const res = validateStructure({ executiveSummary: 'Lorem ipsum dolor sit amet '.repeat(5) }, ['executiveSummary']);
    expect(res.ok).toBe(false);
    expect(res.issues[0]).toMatch(/placeholder/);
  });

  it('passes well-formed content with full score', () => {
    const res = validateStructure(JSON.parse(goodCeoHospital), ['executiveSummary']);
    expect(res.ok).toBe(true);
    expect(res.score).toBe(100);
  });
});

describe('Stage 2: agent-specific validation', () => {
  it('scores CEO content against business concepts', () => {
    const text = 'Business model with subscription pricing, revenue streams, market opportunity, budget of $50k, operational costs, churn risk, and strong profitability.';
    const res = validateAgentRelevance(text, 'ceo');
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.issues).toHaveLength(0);
  });

  it('flags CEO content that reads like a tech spec', () => {
    const text = 'We will deploy Kubernetes clusters with PostgreSQL replicas and GraphQL endpoints behind an API gateway using Node.js microservices.';
    const res = validateAgentRelevance(text, 'ceo');
    expect(res.score).toBeLessThan(50);
    expect(res.issues[0]).toMatch(/CEO/);
  });

  it('does not require identical concepts across agents', () => {
    const marketingText = 'Target audience of young professionals; positioning as the premium brand; acquisition through social media channels and influencer campaigns; launch promotion with referral growth loops.';
    expect(validateAgentRelevance(marketingText, 'marketing').score).toBeGreaterThanOrEqual(80);
    // The same text is NOT a valid developer response
    expect(validateAgentRelevance(marketingText, 'developer').score).toBeLessThan(50);
  });

  it('returns 100 for unknown agent roles', () => {
    expect(validateAgentRelevance('anything', 'unknown').score).toBe(100);
  });
});

describe('Stage 3: domain relevance (per-agent rules)', () => {
  it('technical entities are NOT mandatory in marketing output', () => {
    const text = 'Healthcare launch campaign targeting clinic administrators through medical conferences.';
    const res = validateDomainRelevance(text, 'marketing', HOSPITAL.domain, HOSPITAL.industry, HOSPITAL.mandatoryKeywords);
    expect(res.score).toBeGreaterThanOrEqual(70);
    expect(res.issues).toHaveLength(0);
  });

  it('developer output must model the domain entities', () => {
    const text = 'graph TD Client --> Gateway --> GenericService --> DB';
    const res = validateDomainRelevance(text, 'developer', HOSPITAL.domain, HOSPITAL.industry, HOSPITAL.mandatoryKeywords);
    expect(res.score).toBeLessThan(40);
    expect(res.issues.some(i => /core domain entities/.test(i))).toBe(true);
  });

  it('developer output naming the entities passes', () => {
    const text = 'erDiagram PATIENTS ||--o{ APPOINTMENTS : books DOCTORS ||--o{ APPOINTMENTS : conducts';
    const res = validateDomainRelevance(text, 'developer', HOSPITAL.domain, HOSPITAL.industry, HOSPITAL.mandatoryKeywords);
    expect(res.score).toBeGreaterThanOrEqual(70);
  });

  it('penalizes SaaS buzzwords for CEO in non-SaaS domains', () => {
    const base = 'Retail watches sold with product sales and inventory of watch collections for retail customers.';
    const withBuzzword = base + ' We offer a freemium plan.';
    const clean = validateDomainRelevance(base, 'ceo', 'Retail', 'Luxury Retail', ['Product', 'Inventory', 'Order']);
    const dirty = validateDomainRelevance(withBuzzword, 'ceo', 'Retail', 'Luxury Retail', ['Product', 'Inventory', 'Order']);
    expect(dirty.score).toBeLessThan(clean.score);
    expect(dirty.issues.some(i => /generic SaaS/.test(i))).toBe(true);
  });

  it('does not penalize SaaS buzzwords in SaaS domains', () => {
    const text = 'Our SaaS platform uses a freemium subscription for software teams.';
    const res = validateDomainRelevance(text, 'ceo', 'SaaS', 'B2B Software', []);
    expect(res.issues).toHaveLength(0);
  });

  it('returns 100 when there is nothing to evaluate against', () => {
    const res = validateDomainRelevance('anything at all', 'ceo', '', '', []);
    expect(res.score).toBe(100);
  });
});

describe('Combined validateAIResponse', () => {
  it('passes a good domain-specific response', () => {
    const res = validateAIResponse(goodCeoHospital, ['executiveSummary'], { agentRole: 'ceo', ...HOSPITAL });
    expect(res.passed).toBe(true);
    expect(res.scores.overall).toBeGreaterThanOrEqual(70);
    expect(res.content.executiveSummary).toBeTruthy();
    expect(res.decisions).toEqual([{ category: 'Business', key: 'pricing', value: 'Per-bed pricing', rationale: 'Matches hospital scale' }]);
  });

  it('fails an off-topic generic response and reports issues', () => {
    const generic = JSON.stringify({
      executiveSummary: 'This is a wonderful generic thing that does stuff for everyone everywhere and will be very nice to use daily.',
      decisions: []
    });
    const res = validateAIResponse(generic, ['executiveSummary'], { agentRole: 'ceo', ...HOSPITAL });
    expect(res.passed).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('buildRetryFeedback lists the exact issues and asks to preserve good content', () => {
    const res = validateAIResponse(JSON.stringify({ executiveSummary: 'short' }), ['executiveSummary'], { agentRole: 'ceo', ...HOSPITAL });
    const feedback = buildRetryFeedback(res);
    expect(feedback).toMatch(/structural problems/);
    expect(feedback).toMatch(/too short/);
    expect(feedback).toMatch(/preserving the useful content/);
  });

  it('does not let a 100/100/0 response pass by weighted average', () => {
    const response = JSON.stringify({
      architecture: 'Architecture technology stack framework database PostgreSQL API endpoint module component layer data flow request pipeline scalable infrastructure cloud deploy Docker. '.repeat(2),
      decisions: []
    });
    const res = validateAIResponse(response, ['architecture'], {
      agentRole: 'developer', domain: 'Healthcare', industry: 'Clinical care', mandatoryKeywords: ['Patients', 'Doctors', 'Appointments']
    });
    expect(res.scores.structural).toBe(100);
    expect(res.scores.agentRelevance).toBe(100);
    expect(res.scores.domainRelevance).toBe(0);
    expect(res.passed).toBe(false);
    expect(res.stages.domainRelevance.status).toBe('failed');
  });

  it('keeps valid section content while rejecting malformed and unauthorized decisions', () => {
    const response = JSON.stringify({
      executiveSummary: JSON.parse(goodCeoHospital).executiveSummary,
      decisions: [
        'legacy string',
        { category: 'Technical', key: 'backend', value: 'Python', rationale: 'Preferred' },
        { category: 'Business', key: 'pricing', value: 'Per bed', rationale: 'Scales with hospitals' }
      ]
    });
    const res = validateAIResponse(response, ['executiveSummary'], { agentRole: 'ceo', ...HOSPITAL });
    expect(res.passed).toBe(true);
    expect(res.content.executiveSummary).toBeTruthy();
    expect(res.decisions).toEqual([{ category: 'Business', key: 'pricing', value: 'Per bed', rationale: 'Scales with hospitals' }]);
    expect(res.decisionIssues).toHaveLength(2);
  });
});
