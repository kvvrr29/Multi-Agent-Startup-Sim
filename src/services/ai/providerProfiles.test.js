import { describe, it, expect } from 'vitest';
import { getProviderProfile, CLOUD_THRESHOLDS, LOCAL_THRESHOLDS, getSectionMaxTokens } from './providerProfiles';
import { extractJson, createResponseSchema, validateAIResponse, validateStructure } from './validationLayer';

describe('provider profiles', () => {
  it('holds cloud providers to the original strict gates', () => {
    expect(getProviderProfile('gemini').thresholds).toEqual(CLOUD_THRESHOLDS);
    expect(getProviderProfile('openai').thresholds).toEqual(CLOUD_THRESHOLDS);
    expect(getProviderProfile('gemini').thresholds.overall).toBe(70);
  });

  it('holds the local model to the cloud gates wherever the scoring allows it', () => {
    const local = getProviderProfile('webllm');
    expect(local.thresholds).toEqual(LOCAL_THRESHOLDS);
    // A failed gate here retries and then keeps the best-effort text, so strict
    // numbers cost a call rather than a section.
    expect(local.thresholds.structural).toBe(CLOUD_THRESHOLDS.structural);
    expect(local.thresholds.agentRelevance).toBe(CLOUD_THRESHOLDS.agentRelevance);
    expect(local.thresholds.domainRelevance).toBe(CLOUD_THRESHOLDS.domainRelevance);
    expect(local.thresholds.overall).toBe(CLOUD_THRESHOLDS.overall);
    // The one exception: domain scoring weights entities at 80% for the
    // developer, which a Technology Stack section cannot reach on terminology
    // alone. Anything above 30 would reject every attempt on principle.
    expect(local.thresholds.developerDomainRelevance)
      .toBeLessThan(CLOUD_THRESHOLDS.developerDomainRelevance);
  });

  it('asks the local model for length and the cloud model for nothing', () => {
    expect(getProviderProfile('webllm').minWords).toBe(350);
    expect(getProviderProfile('webllm').minSectionLength).toBeGreaterThan(
      getProviderProfile('gemini').minSectionLength
    );
    // Frontier models are verbose without being told, so no target is stated.
    expect(getProviderProfile('gemini').minWords).toBeNull();
  });

  it('falls back to the strict cloud profile for unknown providers', () => {
    expect(getProviderProfile('something-else').thresholds).toEqual(CLOUD_THRESHOLDS);
    expect(getProviderProfile(undefined).strategy).toBe('batch');
  });

  it('splits work per section only for the local model', () => {
    expect(getProviderProfile('gemini').strategy).toBe('batch');
    expect(getProviderProfile('openai').strategy).toBe('batch');
    expect(getProviderProfile('webllm').strategy).toBe('perSection');
  });

  it('gives cloud providers no token ceiling and the local model a per-section budget', () => {
    expect(getSectionMaxTokens('architecture', getProviderProfile('gemini'))).toBeNull();
    expect(getSectionMaxTokens('architecture', getProviderProfile('webllm'))).toBe(1400);
    // Unknown sections still get the profile default rather than undefined.
    expect(getSectionMaxTokens('madeUpSection', getProviderProfile('webllm'))).toBe(1800);
  });
});

describe('schema dialects', () => {
  it('emits Gemini Type enums for Gemini', () => {
    const schema = createResponseSchema(['executiveSummary'], { dialect: 'gemini' });
    expect(schema.type).toBe('OBJECT');
    expect(schema.properties.executiveSummary.type).toBe('STRING');
    expect(schema.properties.decisions.type).toBe('ARRAY');
  });

  it('emits standard JSON Schema for the other providers', () => {
    const schema = createResponseSchema(['executiveSummary'], { dialect: 'jsonSchema' });
    expect(schema.type).toBe('object');
    expect(schema.properties.executiveSummary.type).toBe('string');
    expect(schema.properties.decisions.items.type).toBe('object');
  });

  it('defaults to the Gemini dialect so existing callers are unaffected', () => {
    expect(createResponseSchema(['executiveSummary']).type).toBe('OBJECT');
  });

  it('requires decisions from Gemini but not from smaller models', () => {
    expect(createResponseSchema(['a'], { dialect: 'gemini' }).required).toContain('decisions');
    expect(createResponseSchema(['a'], { dialect: 'jsonSchema' }).required).not.toContain('decisions');
  });
});

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('recovers JSON wrapped in a fenced code block', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers JSON buried in conversational preamble', () => {
    expect(extractJson('Sure! Here is your section:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('not json {')).toThrow();
    expect(() => extractJson('')).toThrow();
  });
});

const SECTION = 'executiveSummary';
// A complete Executive Summary and nothing more: it covers all four of that
// section's concept groups but says nothing about pricing, budget, cost or
// risk. The local model is asked for one section at a time and scored against
// that section, so this passes; the cloud model is asked for all five CEO
// sections at once and scored against the CEO's whole remit, so it fails.
// The gates are now identical — the difference is what they are pointed at.
const oneGoodSection =
  'Urban customers in dense cities face a persistent problem: ordering food from nearby restaurants is slow, '
  + 'and the gap between placing an order and receiving it is where the frustration lives. '
  + 'This delivery platform is the solution — a service connecting hungry customers with the restaurants closest to them, '
  + 'routing each order to whichever courier is already moving in the right direction. '
  + 'The value for the customer is a shorter wait and a clear picture of where the order actually is. '
  + 'The value for the restaurant is a wider audience without the overhead of running its own fleet. '
  + 'That combination is the advantage this venture is built around, and the rest of the blueprint expands on it.';
// Long enough to clear the length floor, and on topic, but covering only two
// of the four things an Executive Summary is: the problem and who has it.
const halfASection =
  'Urban customers in dense cities face a persistent problem when they want food from nearby restaurants. '
  + 'The wait is long, the tracking is vague, and the frustration compounds every time an order runs late. '
  + 'Customers in these neighbourhoods say repeatedly that the delay itself is the pain point, not the price. '
  + 'Restaurant owners hear the same complaints from the other side of the counter, and they have no good way '
  + 'to respond because they cannot see where the courier is either. This is the gap that keeps coming up in '
  + 'every conversation with the people involved in delivery today, and it is what this document sets out to describe.';
// What the local gates must still reject: a single sentence that answers the
// prompt in name only.
const oneLiner = 'A delivery platform.';

describe('provider-aware validation', () => {
  const build = (text) => JSON.stringify({ [SECTION]: text, decisions: [] });

  it('rejects a single good section for a cloud provider, which is asked for five at once', () => {
    const res = validateAIResponse(build(oneGoodSection), [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'gemini'
    });
    expect(res.passed).toBe(false);
  });

  it('accepts it from the local model, which is asked for that section alone', () => {
    const res = validateAIResponse(build(oneGoodSection), [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'webllm'
    });
    expect(res.passed).toBe(true);
    expect(res.content[SECTION]).toBe(oneGoodSection);
  });

  it('scores partial coverage in steps rather than all-or-nothing', () => {
    const res = validateAIResponse(build(halfASection), [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'webllm'
    });
    // Two of four concept groups. A single lumped group could only ever score
    // 0 or 100, which left every threshold between 1 and 100 doing the same
    // thing — the gate could not be tuned at all.
    expect(res.scores.agentRelevance).toBe(50);
    expect(res.stages.agentRelevance.status).toBe('failed');
    expect(res.passed).toBe(false);
  });

  it('still rejects malformed JSON from the local model', () => {
    const res = validateAIResponse('totally not json', [SECTION], {
      agentRole: 'ceo', providerName: 'webllm'
    });
    expect(res.passed).toBe(false);
    expect(res.issues[0]).toMatch(/not valid JSON/);
  });

  it('rejects a one-line answer from the local model so the retry fires', () => {
    const res = validateAIResponse(build(oneLiner), [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'webllm'
    });
    expect(res.passed).toBe(false);
    expect(res.issues.join(' ')).toMatch(/too short/);
  });

  it('still rejects an empty section from the local model', () => {
    const res = validateAIResponse(build(''), [SECTION], {
      agentRole: 'ceo', providerName: 'webllm'
    });
    expect(res.passed).toBe(false);
  });

  it('accepts fenced JSON from the local model', () => {
    const res = validateAIResponse('```json\n' + build(oneGoodSection) + '\n```', [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'webllm'
    });
    expect(res.passed).toBe(true);
  });

  it('defaults to the cloud gates when no provider is given', () => {
    const withProvider = validateAIResponse(build(oneGoodSection), [SECTION], { agentRole: 'ceo', providerName: 'gemini' });
    const without = validateAIResponse(build(oneGoodSection), [SECTION], { agentRole: 'ceo' });
    expect(without.passed).toBe(withProvider.passed);
    expect(without.stages.agentRelevance.threshold).toBe(CLOUD_THRESHOLDS.agentRelevance);
  });

  it('applies the longer minimum length only to the local model', () => {
    // A real paragraph, but a fraction of the 350 words the local prompt asks
    // for — the cloud gate lets it through, the local gate spends a retry.
    const short = { [SECTION]: 'Revenue comes from commissions on urban delivery orders placed through the platform.' };
    expect(validateStructure(short, [SECTION], { minSectionLength: 50 }).ok).toBe(true);
    expect(validateStructure(short, [SECTION], { minSectionLength: 600 }).ok).toBe(false);
  });
});
