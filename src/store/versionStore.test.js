import { describe, it, expect, beforeEach } from 'vitest';
import { useVersionStore, composeVersionSummary, diffBlueprints } from './versionStore';

beforeEach(() => {
  useVersionStore.getState().reset();
});

describe('composeVersionSummary', () => {
  it('lists section titles', () => {
    expect(composeVersionSummary(['businessModel', 'architecture'], '[AI Generated]'))
      .toBe('[AI Generated] Business Model, System Architecture Updated');
  });

  it('truncates long lists', () => {
    const summary = composeVersionSummary(['businessModel', 'architecture', 'timeline', 'mvpScope', 'keyFeatures']);
    expect(summary).toMatch(/and 2 more Updated$/);
  });

  it('handles empty input', () => {
    expect(composeVersionSummary([])).toBe('Blueprint Updated');
  });
});

describe('diffBlueprints', () => {
  const section = (content, status = 'pending') => ({ content, status });

  it('detects changed, added, and removed sections', () => {
    const snapshot = { a: section('one'), b: section('two'), c: section('three') };
    const current = { a: section('one'), b: section('two changed'), d: section('new'), c: section('') };
    const diff = diffBlueprints(snapshot, current);
    expect(diff.changed).toEqual(['b']);
    expect(diff.added).toEqual(['d']);
    expect(diff.removed).toEqual(['c']);
  });

  it('reports identical blueprints as no diff', () => {
    const bp = { a: section('same') };
    const diff = diffBlueprints(bp, { a: section('same') });
    expect(diff.changed).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it('detects approval-only and provenance-only changes', () => {
    const base = { a: { content: 'same', status: 'pending', generationSource: 'Fallback' } };
    expect(diffBlueprints(base, { a: { ...base.a, status: 'approved' } }).changed).toEqual(['a']);
    expect(diffBlueprints(base, { a: { ...base.a, generationSource: 'Gemini' } }).changed).toEqual(['a']);
  });
});

describe('version store', () => {
  it('saves versions with affected sections and restores deep copies', () => {
    const store = useVersionStore.getState();
    const blueprint = { businessModel: { content: 'v1 content', status: 'approved' } };
    store.saveVersion(blueprint, 'v1 — Initial', ['ceo'], ['businessModel']);

    blueprint.businessModel.content = 'mutated after save';

    const { versions } = useVersionStore.getState();
    expect(versions).toHaveLength(1);
    expect(versions[0].affectedSections).toEqual(['businessModel']);
    expect(versions[0].blueprintSnapshot.businessModel.content).toBe('v1 content');

    const restored = useVersionStore.getState().restoreVersion('v1');
    expect(restored.businessModel.content).toBe('v1 content');
    expect(restored.businessModel.status).toBe('approved');
    // Restored copy is detached from the stored snapshot
    restored.businessModel.content = 'changed';
    expect(useVersionStore.getState().versions[0].blueprintSnapshot.businessModel.content).toBe('v1 content');
    expect(useVersionStore.getState().currentVersionId).toBe('v1');
  });

  it('returns null for unknown versions', () => {
    expect(useVersionStore.getState().restoreVersion('v99')).toBeNull();
  });

  it('keeps version IDs monotonic and stores enriched state', () => {
    const store = useVersionStore.getState();
    const bp = { a: { content: 'one', status: 'pending', generationSource: 'Gemini' } };
    const first = store.saveVersion(bp, 'Initial', ['ceo'], ['a'], { changeType: 'initial', memorySnapshot: { memory: { scope: { budget: '$1k' } } } });
    const second = store.saveVersion(bp, 'Approved', ['ceo'], ['a'], { changeType: 'approval' });
    expect(first.id).toBe('v1');
    expect(second.id).toBe('v2');
    expect(second.changeType).toBe('approval');
    expect(first.memorySnapshot.memory.scope.budget).toBe('$1k');
    expect(first.provenanceSnapshot.a.generationSource).toBe('Gemini');
  });
});
