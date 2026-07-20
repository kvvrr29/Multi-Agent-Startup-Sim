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
import { useAuthStore } from '../store/useAuthStore';

const resolveAll = () => {
  Object.values(api).forEach(fn => fn.mockResolvedValue({}));
};

beforeEach(async () => {
  vi.clearAllMocks();
  resolveAll();
  stopSync();
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useAuthStore.setState({ session: { user: { id: 'u1' } }, activeCloudId: null });
  // Establishes the sync target and the baseline cursor.
  api.createProject.mockResolvedValue({ id: 'proj-1' });
  await createCloudProject({ name: 'Test' });
});

describe('cloudSync section persistence', () => {
  it('pushes a changed section to the database', async () => {
    useProjectStore.getState().updateBlueprintSection('executiveSummary', 'new content');

    await pushNow();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    expect(api.upsertSections).toHaveBeenCalledWith('proj-1', expect.arrayContaining([
      expect.objectContaining({ key: 'executiveSummary', content: 'new content' })
    ]));
  });

  it('does not re-push a section that already synced', async () => {
    useProjectStore.getState().updateBlueprintSection('executiveSummary', 'new content');
    await pushNow();
    expect(api.upsertSections).toHaveBeenCalledTimes(1);

    // A push with no further changes must not resend anything.
    await pushNow();
    expect(api.upsertSections).toHaveBeenCalledTimes(1);
  });

  it('keeps the section cursor unadvanced when the push fails, so it retries', async () => {
    api.upsertSections.mockRejectedValueOnce(new Error('boom'));
    useProjectStore.getState().updateBlueprintSection('executiveSummary', 'new content');

    const okFirst = await pushNow();
    expect(okFirst).toBe(false);
    expect(api.upsertSections).toHaveBeenCalledTimes(1);

    // Next push retries the same section (cursor never advanced past the failure).
    const okSecond = await pushNow();
    expect(okSecond).toBe(true);
    expect(api.upsertSections).toHaveBeenCalledTimes(2);
  });

  it('still syncs edits after reopening a project (startSync must not wipe the cursor)', async () => {
    api.getProject.mockResolvedValue({
      project: { id: 'proj-1', name: 'Test', memory_domain: '' },
      sections: [], events: [], memory: [], decisions: []
    });
    // Returning-user flow: open the existing project, THEN start syncing.
    await openCloudProject('proj-1');
    startSync();

    useProjectStore.getState().updateBlueprintSection('executiveSummary', 'shorter body');
    await pushNow();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    stopSync();
  });

  it('automatically pushes after the debounce when a section changes (subscription wiring)', async () => {
    api.getProject.mockResolvedValue({
      project: { id: 'proj-1', name: 'Test', memory_domain: '' },
      sections: [], events: [], memory: [], decisions: []
    });
    await openCloudProject('proj-1');
    startSync();

    vi.useFakeTimers();
    // No manual pushNow: this must travel store change -> subscription -> debounce -> push.
    useProjectStore.getState().updateBlueprintSection('executiveSummary', 'shorter body');
    await vi.advanceTimersByTimeAsync(1600);
    vi.useRealTimers();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    stopSync();
  });
});
