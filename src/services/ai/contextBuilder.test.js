import { beforeEach, describe, expect, it } from 'vitest';
import { buildContextString } from './contextBuilder';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';

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
    const pending = 'Unrelated pending text '.repeat(40);
    useProjectStore.getState().updateBlueprintSection('businessModel', approved, 'approved');
    useProjectStore.getState().updateBlueprintSection('marketingStrategy', pending, 'pending');
    const context = buildContextString('', 'developer');
    expect(context).toContain(approved.trim());
    expect(context).not.toContain(pending.trim());
  });
});
