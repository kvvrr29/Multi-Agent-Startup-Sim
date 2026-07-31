import { describe, it, expect } from 'vitest';
import { getProviderProfile, CLOUD_THRESHOLDS, LOCAL_THRESHOLDS, getSectionMaxTokens } from './providerProfiles';
import { extractJson, createResponseSchema, validateAIResponse, validateStructure } from './validationLayer';

describe('provider profiles', () => {
  it('holds cloud providers to the original strict gates', () => {
    expect(getProviderProfile('gemini').thresholds).toEqual(CLOUD_THRESHOLDS);
    expect(getProviderProfile('openai').thresholds).toEqual(CLOUD_THRESHOLDS);
    expect(getProviderProfile('gemini').thresholds.overall).toBe(70);
  });

  it('relaxes gates only for the local model', () => {
    const local = getProviderProfile('webllm');
    expect(local.thresholds).toEqual(LOCAL_THRESHOLDS);
    expect(local.thresholds.overall).toBeLessThan(CLOUD_THRESHOLDS.overall);
    // Structural validity is never relaxed — malformed JSON must still fail.
    expect(local.thresholds.structural).toBe(100);
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
    expect(getSectionMaxTokens('architecture', getProviderProfile('webllm'))).toBe(900);
    // Unknown sections still get the profile default rather than undefined.
    expect(getSectionMaxTokens('madeUpSection', getProviderProfile('webllm'))).toBe(1500);
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
const thinButReal = 'A delivery platform for urban customers with revenue from commissions.';

describe('provider-aware validation', () => {
  const build = (text) => JSON.stringify({ [SECTION]: text, decisions: [] });

  it('rejects thin content for a cloud provider', () => {
    const res = validateAIResponse(build(thinButReal), [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'gemini'
    });
    expect(res.passed).toBe(false);
  });

  it('accepts the same thin content from the local model', () => {
    const res = validateAIResponse(build(thinButReal), [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'webllm'
    });
    expect(res.passed).toBe(true);
    expect(res.content[SECTION]).toBe(thinButReal);
  });

  it('still rejects malformed JSON from the local model', () => {
    const res = validateAIResponse('totally not json', [SECTION], {
      agentRole: 'ceo', providerName: 'webllm'
    });
    expect(res.passed).toBe(false);
    expect(res.issues[0]).toMatch(/not valid JSON/);
  });

  it('still rejects an empty section from the local model', () => {
    const res = validateAIResponse(build(''), [SECTION], {
      agentRole: 'ceo', providerName: 'webllm'
    });
    expect(res.passed).toBe(false);
  });

  it('accepts fenced JSON from the local model', () => {
    const res = validateAIResponse('```json\n' + build(thinButReal) + '\n```', [SECTION], {
      agentRole: 'ceo', domain: 'FoodTech', industry: 'Delivery', providerName: 'webllm'
    });
    expect(res.passed).toBe(true);
  });

  it('defaults to the strict cloud gates when no provider is given', () => {
    const withProvider = validateAIResponse(build(thinButReal), [SECTION], { agentRole: 'ceo', providerName: 'gemini' });
    const without = validateAIResponse(build(thinButReal), [SECTION], { agentRole: 'ceo' });
    expect(without.passed).toBe(withProvider.passed);
    expect(without.stages.agentRelevance.threshold).toBe(CLOUD_THRESHOLDS.agentRelevance);
  });

  it('applies the shorter minimum length only to the local model', () => {
    const short = { [SECTION]: 'Revenue from commissions on urban delivery.' }; // ~43 chars
    expect(validateStructure(short, [SECTION], { minSectionLength: 50 }).ok).toBe(false);
    expect(validateStructure(short, [SECTION], { minSectionLength: 25 }).ok).toBe(true);
  });
});
