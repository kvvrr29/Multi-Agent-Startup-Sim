import { beforeEach, describe, expect, it } from 'vitest';
import { buildContextString } from './contextBuilder';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { getMaxContextTokens, getProviderProfile } from './providerProfiles';

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useProjectStore.getState().setProject({
    name: 'ClinicFlow', idea: 'Hospital workflow software', targetAudience: 'All hospitals', budget: '$100k',
    platform: 'web', timeline: '12 months', teamSize: '6', priorities: 'Compliance'
  });
});

describe('agent context construction', () => {
  it('uses current memory overrides before original project fields', () => {
    useProjectMemoryStore.getState().applyDecision({
      category: 'Business', key: 'targetAudience', value: 'Regional clinics', rationale: 'Pilot focus'
    }, { agent: 'ceo', instruction: 'Narrow market' });
    useProjectMemoryStore.getState().updateMemory('scope', 'budget', '$60k');
    const context = buildContextString('Revise backend only', 'developer');
    expect(context).toContain('Target Audience: Regional clinics');
    expect(context).toContain('Budget: $60k');
    expect(context).not.toContain('Target Audience: All hospitals');
  });

  it('keeps approved sections complete while truncating unrelated pending content', () => {
    const approved = 'Approved settled fact '.repeat(40);
    const pending = 'Unrelated pending text '.repeat(60); // 1380 chars, over the allowance
    useProjectStore.getState().updateBlueprintSection('businessModel', approved, 'approved');
    useProjectStore.getState().updateBlueprintSection('marketingStrategy', pending, 'pending');
    const context = buildContextString('', 'developer');
    expect(context).toContain(approved.trim());
    expect(context).not.toContain(pending.trim());
  });

  it('gives an agent 800 characters of the work it did not write', () => {
    // The pipeline is sequential, so this is the entire view each agent has of
    // its predecessors. At the old 240 the Developer saw roughly the opening
    // sentence of Key Features and nothing else.
    const upstream = 'Key feature detail that the developer needs in order to design for it. '.repeat(40);
    useProjectStore.getState().updateBlueprintSection('keyFeatures', upstream, 'pending');

    const context = buildContextString('', 'developer');

    expect(context).toContain(upstream.substring(0, 800));
    expect(context).not.toContain(upstream.substring(0, 801));
  });

  it('does not truncate a non-focus section that already fits the allowance', () => {
    const short = 'A brief settled note on positioning.';
    useProjectStore.getState().updateBlueprintSection('marketingStrategy', short, 'pending');
    const context = buildContextString('', 'developer');
    expect(context).toContain(short);
    expect(context).not.toContain('…');
  });
});

describe('fitting the context into a fixed window', () => {
  const SECTIONS = ['executiveSummary', 'targetUsers', 'businessModel', 'budgetCostEstimate',
    'risksMitigation', 'problemStatement', 'proposedSolution', 'mvpScope', 'keyFeatures',
    'productRoadmap', 'timeline', 'architecture', 'technologyStack', 'marketingStrategy'];
  const tokens = (s) => Math.ceil(s.length / 4);
  // Approved sections are never truncated by the original rule, so a full
  // blueprint of them is what makes the context unbounded.
  const fillApproved = (wordsEach) => {
    const body = 'specific detail about the product and its users '.repeat(wordsEach / 8);
    SECTIONS.forEach(key => {
      useProjectStore.getState().updateBlueprintSection(key, body, 'approved');
    });
  };

  it('leaves the context untouched when no budget is given', () => {
    fillApproved(350);
    const context = buildContextString('', 'ceo');
    // Fourteen approved sections at 350 words each already exceed what the
    // local window can hold once the answer is accounted for — and this is
    // exactly what the cloud path is expected to keep sending regardless.
    const localBudget = getMaxContextTokens(getProviderProfile('webllm'), 1400);
    expect(tokens(context)).toBeGreaterThan(localBudget);
    expect(context).not.toContain('…');
  });

  it('trims non-focus sections until the brief fits the budget', () => {
    fillApproved(350);
    const context = buildContextString('', 'ceo', {
      focusSections: ['executiveSummary'],
      maxContextTokens: 4000
    });
    expect(tokens(context)).toBeLessThanOrEqual(4000);
    expect(context).toContain('…');
  });

  it('never trims the section it was asked to write', () => {
    fillApproved(350);
    const focusText = 'The unique marketing wording that a revision instruction refers back to. '.repeat(30);
    useProjectStore.getState().updateBlueprintSection('marketingStrategy', focusText, 'approved');

    const context = buildContextString('make this section bigger', 'marketing', {
      focusSections: ['marketingStrategy'],
      maxContextTokens: 2500
    });

    // Trimming this would leave "make this section bigger" with no referent,
    // which is the bug the whole focus-section mechanism exists to prevent.
    expect(context).toContain(focusText.trim());
    expect(tokens(context)).toBeLessThanOrEqual(2500);
  });

  it('fits the heaviest local call inside its budget without trimming', () => {
    // The Mediator runs last and sees all seventeen sections. If the raised
    // allowance overflows anywhere it is here, so this is the case that
    // justifies 800 rather than something smaller.
    const body = 'specific detail about the product and its users '.repeat(44); // ~350 words
    Object.keys(useProjectStore.getState().blueprint).forEach(key => {
      useProjectStore.getState().updateBlueprintSection(key, body, 'pending');
    });
    const budget = getMaxContextTokens(getProviderProfile('webllm'), 1300);

    const context = buildContextString('', 'mediator', {
      focusSections: ['finalRecommendations'],
      maxContextTokens: budget
    });

    expect(tokens(context)).toBeLessThanOrEqual(budget);
    // Under budget means the trim loop never ran, so every non-focus section
    // still carries its full 800-character allowance.
    expect(context).toContain(body.substring(0, 800));
  });

  it('never lets a trim step widen a pending section', () => {
    // TRIM_STEPS opens at 1600 to cut approved sections down from full length.
    // Applied to a pending section that already sits at 800, that would grow
    // the context the loop is trying to shrink.
    const long = 'Approved settled detail that runs well past any trim step. '.repeat(60);
    const pending = 'Pending detail that must stay at its standard allowance. '.repeat(60);
    SECTIONS.forEach(key => useProjectStore.getState().updateBlueprintSection(key, long, 'approved'));
    useProjectStore.getState().updateBlueprintSection('marketingStrategy', pending, 'pending');

    const context = buildContextString('', 'ceo', {
      focusSections: ['executiveSummary'],
      maxContextTokens: 4000
    });

    expect(context).toContain(pending.substring(0, 800));
    expect(context).not.toContain(pending.substring(0, 801));
  });

  it('does not trim at all when the brief already fits', () => {
    fillApproved(40);
    const budgeted = buildContextString('', 'ceo', {
      focusSections: ['executiveSummary'], maxContextTokens: 6000
    });
    const unbudgeted = buildContextString('', 'ceo', { focusSections: ['executiveSummary'] });
    expect(budgeted).toBe(unbudgeted);
  });
});
