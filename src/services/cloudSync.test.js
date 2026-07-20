import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  api: {
    createProject: vi.fn(),
    getProject: vi.fn(),
    updateProjectMeta: vi.fn(),
    upsertSections: vi.fn(),
    appendEvents: vi.fn(),
    upsertMemory: vi.fn(),
    appendDecisions: vi.fn()
  }
}));

import { api } from './apiClient';
import { createCloudProject, openCloudProject, startSync, pushNow, stopSync } from './cloudSync';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { useSectionHistoryStore } from '../store/sectionHistoryStore';
import { useAuthStore } from '../store/useAuthStore';

const resolveAll = () => {
  Object.values(api).forEach(fn => fn.mockResolvedValue({}));
};

// Sections only persist once approved; set status directly to emulate approval.
const setSection = (key, content, status = 'pending') =>
  useProjectStore.getState().updateBlueprintSection(key, content, status);

beforeEach(async () => {
  vi.clearAllMocks();
  resolveAll();
  stopSync();
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useSectionHistoryStore.setState({ activeProjectId: null, byProject: {} });
  useAuthStore.setState({ session: { user: { id: 'u1' } }, activeCloudId: null });
  // Establishes the sync target and the baseline cursor.
  api.createProject.mockResolvedValue({ id: 'proj-1' });
  await createCloudProject({ name: 'Test' });
});

describe('cloudSync section persistence (approved-only)', () => {
  it('does not push unapproved (pending) section changes', async () => {
    setSection('executiveSummary', 'draft content', 'pending');

    await pushNow();

    expect(api.upsertSections).not.toHaveBeenCalled();
  });

  it('pushes a section once it is approved', async () => {
    setSection('executiveSummary', 'final content', 'approved');

    await pushNow();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    expect(api.upsertSections).toHaveBeenCalledWith('proj-1', expect.arrayContaining([
      expect.objectContaining({ key: 'executiveSummary', content: 'final content', status: 'approved' })
    ]));
  });

  it('does not re-push an approved section that already synced', async () => {
    setSection('executiveSummary', 'final content', 'approved');
    await pushNow();
    expect(api.upsertSections).toHaveBeenCalledTimes(1);

    await pushNow();
    expect(api.upsertSections).toHaveBeenCalledTimes(1);
  });

  it('keeps the section cursor unadvanced when the push fails, so it retries', async () => {
    api.upsertSections.mockRejectedValueOnce(new Error('boom'));
    setSection('executiveSummary', 'final content', 'approved');

    const okFirst = await pushNow();
    expect(okFirst).toBe(false);
    expect(api.upsertSections).toHaveBeenCalledTimes(1);

    const okSecond = await pushNow();
    expect(okSecond).toBe(true);
    expect(api.upsertSections).toHaveBeenCalledTimes(2);
  });

  it('syncs an approved section after reopening a project (startSync must not wipe the cursor)', async () => {
    api.getProject.mockResolvedValue({
      project: { id: 'proj-1', name: 'Test', memory_domain: '' },
      sections: [], events: [], memory: [], decisions: []
    });
    await openCloudProject('proj-1');
    startSync();

    setSection('executiveSummary', 'final content', 'approved');
    await pushNow();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    stopSync();
  });

  it('automatically pushes after the debounce when a section is approved (subscription wiring)', async () => {
    api.getProject.mockResolvedValue({
      project: { id: 'proj-1', name: 'Test', memory_domain: '' },
      sections: [], events: [], memory: [], decisions: []
    });
    await openCloudProject('proj-1');
    startSync();

    vi.useFakeTimers();
    setSection('executiveSummary', 'final content', 'approved');
    await vi.advanceTimersByTimeAsync(1600);
    vi.useRealTimers();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    stopSync();
  });
});
