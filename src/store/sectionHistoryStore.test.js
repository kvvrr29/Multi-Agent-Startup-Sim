import { beforeEach, describe, expect, it } from 'vitest';
import { useSectionHistoryStore } from './sectionHistoryStore';
import { useProjectStore } from './useProjectStore';

const content = (key) => useProjectStore.getState().blueprint[key].content;
const status = (key) => useProjectStore.getState().blueprint[key].status;
const info = (key) => useSectionHistoryStore.getState().versionInfo(key);
const entry = (key) => useSectionHistoryStore.getState().getEntry(key);

beforeEach(() => {
  useSectionHistoryStore.setState({ activeProjectId: null, byProject: {} });
  useProjectStore.getState().reset();
});

describe('section history store', () => {
  it('appends versions, tracks the active index, and projects content to the blueprint', () => {
    const store = useSectionHistoryStore.getState();
    store.loadProject('p1', []);

    store.addVersion('executiveSummary', 'v1 content', { generationSource: 'Gemini' });
    expect(info('executiveSummary')).toEqual({ index: 0, count: 1 });
    expect(content('executiveSummary')).toBe('v1 content');

    store.addVersion('executiveSummary', 'v2 content', {});
    expect(info('executiveSummary')).toEqual({ index: 1, count: 2 });
    expect(content('executiveSummary')).toBe('v2 content');
  });

  it('navigates versions and projects the selected version content', () => {
    const store = useSectionHistoryStore.getState();
    store.loadProject('p1', []);
    store.addVersion('executiveSummary', 'v1 content', {});
    store.addVersion('executiveSummary', 'v2 content', {});

    store.setActiveIndex('executiveSummary', 0);
    expect(info('executiveSummary').index).toBe(0);
    expect(content('executiveSummary')).toBe('v1 content');

    // Clamps out-of-range indices.
    store.setActiveIndex('executiveSummary', 99);
    expect(info('executiveSummary').index).toBe(1);
    store.setActiveIndex('executiveSummary', -5);
    expect(info('executiveSummary').index).toBe(0);
  });

  it('approve deletes the section drafts and the section is locked', () => {
    const store = useSectionHistoryStore.getState();
    store.loadProject('p1', []);
    store.addVersion('executiveSummary', 'v1 content', {});
    store.addVersion('executiveSummary', 'v2 content', {});
    store.addVersion('executiveSummary', 'v3 content', {});

    store.setActiveIndex('executiveSummary', 1); // view v2
    // Mirror approveSectionWorkflow: flip blueprint status, then drop drafts.
    useProjectStore.getState().approveBlueprintSection('executiveSummary');
    store.approveSection('executiveSummary');

    // Client-side drafts are gone; content remains (now from the DB-bound blueprint).
    expect(entry('executiveSummary')).toBeNull();
    expect(info('executiveSummary')).toEqual({ index: 0, count: 0 });
    expect(content('executiveSummary')).toBe('v2 content');
    expect(status('executiveSummary')).toBe('approved');

    // Locked: further versions are rejected (guarded by blueprint status).
    const added = store.addVersion('executiveSummary', 'v4 content', {});
    expect(added).toBe(false);
    expect(entry('executiveSummary')).toBeNull();
  });

  it('reload reconciliation: DB approved wins (no draft kept), local unapproved drafts restored', () => {
    const store = useSectionHistoryStore.getState();
    store.loadProject('p2', []);
    store.addVersion('executiveSummary', 'exec draft', {});
    store.addVersion('problemStatement', 'problem draft', {});
    useProjectStore.getState().reset(); // simulate a reload wiping the display

    store.loadProject('p2', [
      { section_key: 'executiveSummary', status: 'approved', content: 'EXEC FINAL', generation_source: 'Gemini' },
      { section_key: 'problemStatement', status: 'pending', content: '' }
    ]);

    // Approved section: no client draft, content + approved status projected.
    expect(entry('executiveSummary')).toBeNull();
    expect(content('executiveSummary')).toBe('EXEC FINAL');
    expect(status('executiveSummary')).toBe('approved');

    // Unapproved section: local draft restored.
    expect(info('problemStatement')).toEqual({ index: 0, count: 1 });
    expect(content('problemStatement')).toBe('problem draft');
  });
});
