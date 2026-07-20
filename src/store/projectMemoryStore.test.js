import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectMemoryStore } from './projectMemoryStore';

beforeEach(() => useProjectMemoryStore.getState().clearMemory());

describe('structured project memory', () => {
  it('updates canonical facts and appends decision metadata', () => {
    const store = useProjectMemoryStore.getState();
    store.applyDecision(
      { category: 'Business', key: 'targetAudience', value: 'Regional clinics', rationale: 'Focused pilot' },
      { agent: 'ceo', instruction: 'Narrow audience' }
    );
    const state = useProjectMemoryStore.getState();
    expect(state.memory.business.targetAudience).toBe('Regional clinics');
    expect(state.decisionHistory).toHaveLength(1);
    expect(state.decisionHistory[0]).toMatchObject({ agent: 'ceo', instruction: 'Narrow audience' });
  });

  it('preserves unrelated facts across later decisions and restores snapshots', () => {
    const store = useProjectMemoryStore.getState();
    store.applyDecision({ category: 'Business', key: 'targetAudience', value: 'Students', rationale: 'Launch focus' });
    const snapshot = useProjectMemoryStore.getState().getSnapshot();
    store.applyDecision({ category: 'Technical', key: 'backend', value: 'FastAPI', rationale: 'Team skill' });
    expect(useProjectMemoryStore.getState().memory.business.targetAudience).toBe('Students');
    useProjectMemoryStore.getState().restoreSnapshot(snapshot);
    expect(useProjectMemoryStore.getState().memory.business.targetAudience).toBe('Students');
    expect(useProjectMemoryStore.getState().memory.technical.backend).toBeUndefined();
  });
});
