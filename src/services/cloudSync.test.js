import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  api: {
    createProject: vi.fn(),
    getProjectBlueprint: vi.fn(),
    getProjectMeta: vi.fn(),
    getProjectEvents: vi.fn(),
    getProjectMemory: vi.fn(),
    getProjectDecisions: vi.fn(),
    updateProjectMeta: vi.fn(),
    upsertSections: vi.fn(),
    appendEvents: vi.fn(),
    upsertMemory: vi.fn(),
    appendDecisions: vi.fn()
  }
}));

import { api } from './apiClient';
import { createCloudProject, ensureProjectResources, openCloudProject, startSync, pushNow, stopSync } from './cloudSync';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { useSectionHistoryStore } from '../store/sectionHistoryStore';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectResourceStore } from '../store/useProjectResourceStore';

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
  useAuthStore.setState({
    session: { user: { id: 'u1' } },
    activeCloudId: null,
    cloudProjects: [],
    projectsHasMore: false,
    projectsNextOffset: 0,
    projectsLoadingMore: false
  });
  // Establishes the sync target and the baseline cursor.
  api.createProject.mockResolvedValue({ id: 'proj-1', name: 'Registry Name' });
  await createCloudProject({ name: 'Test' });
});

describe('new-project synchronization baseline', () => {
  it('initializes local project metadata before the cursor and does not echo the create payload', async () => {
    await pushNow();

    expect(useProjectStore.getState().project).toMatchObject({ id: 'proj-1', name: 'Test' });
    expect(api.updateProjectMeta).not.toHaveBeenCalled();
  });

  it('persists a subsequently classified scope domain only as a memory entry', async () => {
    useProjectMemoryStore.getState().updateMemory('scope', 'domain', 'HealthTech');

    await pushNow();

    expect(api.upsertMemory).toHaveBeenCalledWith('proj-1', {
      entries: [{ category: 'scope', key: 'domain', value: 'HealthTech' }]
    });
    expect(api.updateProjectMeta).not.toHaveBeenCalled();
  });
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
    api.getProjectBlueprint.mockResolvedValue({ sections: [] });
    await openCloudProject('proj-1');
    startSync();

    setSection('executiveSummary', 'final content', 'approved');
    await pushNow();

    expect(api.upsertSections).toHaveBeenCalledTimes(1);
    stopSync();
  });

  it('automatically pushes after the debounce when a section is approved (subscription wiring)', async () => {
    api.getProjectBlueprint.mockResolvedValue({ sections: [] });
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

describe('blueprint-only project opening', () => {
  it('uses the registry name, hydrates sections, and leaves deferred stores empty', async () => {
    vi.clearAllMocks();
    resolveAll();
    api.getProjectBlueprint.mockResolvedValue({
      sections: [{
        section_key: 'executiveSummary',
        content: 'Approved cloud summary',
        status: 'approved',
        generation_source: 'Gemini',
        generated_by: 'ceo',
        validation_scores: { quality: 0.9 },
        generated_at: '2026-07-20T10:00:00.000Z',
        failure_reason: null,
        updated_at: '2026-07-20T10:01:00.000Z'
      }]
    });

    const opened = await openCloudProject('proj-1');

    expect(opened).toBe(true);
    expect(api.getProjectBlueprint).toHaveBeenCalledTimes(1);
    expect(api.getProjectBlueprint).toHaveBeenCalledWith('proj-1');
    expect(api.updateProjectMeta).not.toHaveBeenCalled();
    expect(api.appendEvents).not.toHaveBeenCalled();
    expect(api.upsertMemory).not.toHaveBeenCalled();
    expect(api.appendDecisions).not.toHaveBeenCalled();
    expect(useProjectStore.getState().project).toEqual({ id: 'proj-1', name: 'Registry Name' });
    expect(useProjectStore.getState().blueprint.executiveSummary).toMatchObject({
      content: 'Approved cloud summary',
      status: 'approved',
      generationSource: 'Gemini',
      generatedBy: 'ceo'
    });
    expect(useProjectStore.getState().workflowEvents).toEqual([]);
    expect(useProjectStore.getState().activeRevision).toBeNull();
    expect(useProjectStore.getState().recentRevisionResult).toBeNull();
    expect(useProjectStore.getState().deferredDataState).toBe('unloaded');
    expect(Object.values(useProjectStore.getState().agents).every(agent =>
      agent.status === 'Idle' && agent.currentTask === null
    )).toBe(true);
    expect(useProjectMemoryStore.getState().memory).toMatchObject({
      business: {}, product: {}, technical: {}, marketing: {}, scope: {}
    });
    expect(useProjectMemoryStore.getState().decisionHistory).toEqual([]);
  });

  it('flushes approved outgoing changes before reading the incoming blueprint', async () => {
    useAuthStore.setState(state => ({
      cloudProjects: [...state.cloudProjects, { id: 'proj-2', name: 'Second Project' }]
    }));
    setSection('executiveSummary', 'outgoing approved edit', 'approved');
    api.getProjectBlueprint.mockResolvedValue({ sections: [] });

    await openCloudProject('proj-2');

    expect(api.upsertSections).toHaveBeenCalledWith('proj-1', expect.any(Array));
    expect(api.upsertSections.mock.invocationCallOrder[0])
      .toBeLessThan(api.getProjectBlueprint.mock.invocationCallOrder[0]);
  });

  it('clears data from the outgoing project when switching', async () => {
    useAuthStore.setState(state => ({
      cloudProjects: [...state.cloudProjects, { id: 'proj-2', name: 'Second Project' }]
    }));
    useProjectStore.setState({
      workflowEvents: [{ id: 'old-event', message: 'old' }],
      activeRevision: { request: 'old revision' },
      recentRevisionResult: { message: 'old result' }
    });
    useProjectStore.getState().updateAgentStatus('ceo', 'Working', 'old task');
    useProjectMemoryStore.getState().updateMemory('business', 'oldKey', 'old value');
    useProjectMemoryStore.getState().applyDecision({ category: 'Business', key: 'choice', value: 'old' });
    // This test is about incoming hydration, not flushing the synthetic state.
    stopSync();
    api.getProjectBlueprint.mockResolvedValue({ sections: [] });

    await openCloudProject('proj-2');

    expect(useAuthStore.getState().activeCloudId).toBe('proj-2');
    expect(useProjectStore.getState().project).toEqual({ id: 'proj-2', name: 'Second Project' });
    expect(useProjectStore.getState().workflowEvents).toEqual([]);
    expect(useProjectStore.getState().activeRevision).toBeNull();
    expect(useProjectStore.getState().recentRevisionResult).toBeNull();
    expect(useProjectStore.getState().agents.ceo).toMatchObject({ status: 'Idle', currentTask: null });
    expect(useProjectMemoryStore.getState().memory.business).toEqual({});
    expect(useProjectMemoryStore.getState().decisionHistory).toEqual([]);
  });

  it('preserves the active project when the blueprint request fails', async () => {
    useAuthStore.setState(state => ({
      cloudProjects: [...state.cloudProjects, { id: 'proj-2', name: 'Second Project' }]
    }));
    useProjectStore.setState({ project: { id: 'proj-1', name: 'Current Project' } });
    setSection('executiveSummary', 'Keep this content', 'approved');
    api.getProjectBlueprint.mockRejectedValueOnce(new Error('offline'));

    const opened = await openCloudProject('proj-2');

    expect(opened).toBe(false);
    expect(useAuthStore.getState().activeCloudId).toBe('proj-1');
    expect(useProjectStore.getState().project).toEqual({ id: 'proj-1', name: 'Current Project' });
    expect(useProjectStore.getState().blueprint.executiveSummary.content).toBe('Keep this content');
  });

  it('keeps approved database content while overlaying local unapproved drafts', async () => {
    useAuthStore.setState(state => ({
      cloudProjects: [...state.cloudProjects, { id: 'proj-2', name: 'Draft Project' }]
    }));
    useSectionHistoryStore.setState({
      activeProjectId: 'proj-1',
      byProject: {
        'proj-2': {
          executiveSummary: {
            versions: [{ content: 'stale local approved draft', timestamp: '2026-07-19T00:00:00.000Z' }],
            activeIndex: 0
          },
          businessModel: {
            versions: [{ content: 'local pending draft', generatedBy: 'ceo', timestamp: '2026-07-20T00:00:00.000Z' }],
            activeIndex: 0
          }
        }
      }
    });
    api.getProjectBlueprint.mockResolvedValue({
      sections: [
        { section_key: 'executiveSummary', content: 'database approved content', status: 'approved' },
        { section_key: 'businessModel', content: 'database pending content', status: 'pending' }
      ]
    });

    await openCloudProject('proj-2');

    expect(useProjectStore.getState().blueprint.executiveSummary).toMatchObject({
      content: 'database approved content', status: 'approved'
    });
    expect(useProjectStore.getState().blueprint.businessModel).toMatchObject({
      content: 'local pending draft', status: 'pending', generatedBy: 'ceo'
    });
    expect(useSectionHistoryStore.getState().byProject['proj-2'].executiveSummary).toBeUndefined();
  });
});

describe('lazy project resource hydration', () => {
  const reopen = async () => {
    api.getProjectBlueprint.mockResolvedValue({ sections: [] });
    await openCloudProject('proj-1');
  };

  it('loads only requested memory and caches it for the open project', async () => {
    await reopen();
    api.getProjectMemory.mockResolvedValue({
      entries: [{ category: 'business', key: 'market', value: 'Clinics' }]
    });

    await ensureProjectResources(['memory']);
    await ensureProjectResources(['memory']);

    expect(api.getProjectMemory).toHaveBeenCalledTimes(1);
    expect(api.getProjectMeta).not.toHaveBeenCalled();
    expect(api.getProjectEvents).not.toHaveBeenCalled();
    expect(api.getProjectDecisions).not.toHaveBeenCalled();
    expect(useProjectMemoryStore.getState().memory.business.market).toBe('Clinics');
    expect(useProjectResourceStore.getState().resources.memory.status).toBe('ready');
  });

  it('deduplicates concurrent consumers of the same resource', async () => {
    await reopen();
    let resolveMemory;
    api.getProjectMemory.mockReturnValue(new Promise(resolve => { resolveMemory = resolve; }));

    const first = ensureProjectResources(['memory']);
    const second = ensureProjectResources(['memory']);
    expect(api.getProjectMemory).toHaveBeenCalledTimes(1);
    resolveMemory({ entries: [] });
    await Promise.all([first, second]);
  });

  it('keeps successful sibling resources when one load fails and retries only the failure', async () => {
    await reopen();
    api.getProjectMeta.mockResolvedValue({ idea: 'Loaded idea' });
    api.getProjectMemory.mockRejectedValueOnce(new Error('memory offline'));
    api.getProjectDecisions.mockResolvedValue({ decisions: [] });

    await expect(ensureProjectResources(['meta', 'memory', 'decisions'])).rejects.toThrow('memory offline');
    expect(useProjectResourceStore.getState().resources).toMatchObject({
      meta: { status: 'ready' },
      memory: { status: 'error', error: 'memory offline' },
      decisions: { status: 'ready' }
    });

    api.getProjectMemory.mockResolvedValue({ entries: [] });
    await ensureProjectResources(['meta', 'memory', 'decisions']);
    expect(api.getProjectMeta).toHaveBeenCalledTimes(1);
    expect(api.getProjectMemory).toHaveBeenCalledTimes(2);
    expect(api.getProjectDecisions).toHaveBeenCalledTimes(1);
  });

  it('ignores a late response after switching projects', async () => {
    await reopen();
    let resolveEvents;
    api.getProjectEvents.mockReturnValue(new Promise(resolve => { resolveEvents = resolve; }));
    const oldLoad = ensureProjectResources(['events']);

    useAuthStore.setState(state => ({
      cloudProjects: [...state.cloudProjects, { id: 'proj-2', name: 'Second Project' }]
    }));
    api.getProjectBlueprint.mockResolvedValue({ sections: [] });
    await openCloudProject('proj-2');
    resolveEvents({ events: [{ id: 'old-db-event', message: 'Must stay old' }] });

    await expect(oldLoad).rejects.toThrow('active project changed');
    expect(useProjectStore.getState().workflowEvents).toEqual([]);
    expect(useProjectResourceStore.getState().projectId).toBe('proj-2');
    expect(useProjectResourceStore.getState().resources.events.status).toBe('idle');
  });

  it('merges database append-only rows before unsynced local rows and pushes only locals', async () => {
    await reopen();
    useProjectStore.setState({
      workflowEvents: [{ id: 'local-event', timestamp: '2026-07-20T11:00:00.000Z', message: 'local' }]
    });
    useProjectMemoryStore.setState({
      decisionHistory: [{ id: 'local-decision', timestamp: '2026-07-20T11:00:00.000Z', category: 'Business', key: 'price', value: 'local' }]
    });
    api.getProjectEvents.mockResolvedValue({
      events: [{ id: 'db-event', timestamp: '2026-07-20T10:00:00.000Z', message: 'database' }]
    });
    api.getProjectDecisions.mockResolvedValue({
      decisions: [{ id: 'db-decision', timestamp: '2026-07-20T10:00:00.000Z', category: 'Business', key: 'market', value: 'database' }]
    });

    await ensureProjectResources(['events', 'decisions']);
    expect(useProjectStore.getState().workflowEvents.map(event => event.id)).toEqual(['db-event', 'local-event']);
    expect(useProjectMemoryStore.getState().decisionHistory.map(decision => decision.id)).toEqual(['db-decision', 'local-decision']);

    await pushNow();
    expect(api.appendEvents).toHaveBeenCalledWith('proj-1', [expect.objectContaining({ id: 'local-event' })]);
    expect(api.appendDecisions).toHaveBeenCalledWith('proj-1', [expect.objectContaining({ id: 'local-decision' })]);
  });

  it('rebases hydrated memory without echoing it through synchronization', async () => {
    await reopen();
    api.getProjectMemory.mockResolvedValue({
      entries: [{ category: 'technical', key: 'database', value: 'Postgres' }]
    });

    await ensureProjectResources(['memory']);
    await pushNow();

    expect(useProjectMemoryStore.getState().memory.technical.database).toBe('Postgres');
    expect(api.upsertMemory).not.toHaveBeenCalled();
    expect(api.updateProjectMeta).not.toHaveBeenCalled();
  });

  it('upserts only the memory key that changed after hydration', async () => {
    await reopen();
    api.getProjectMemory.mockResolvedValue({
      entries: [
        { category: 'technical', key: 'database', value: 'Postgres' },
        { category: 'technical', key: 'hosting', value: 'Cloud Run' },
        { category: 'business', key: 'market', value: 'Clinics' }
      ]
    });
    await ensureProjectResources(['memory']);
    useProjectMemoryStore.getState().updateMemory('technical', 'database', 'CockroachDB');

    await pushNow();

    expect(api.upsertMemory).toHaveBeenCalledTimes(1);
    expect(api.upsertMemory).toHaveBeenCalledWith('proj-1', {
      entries: [{ category: 'technical', key: 'database', value: 'CockroachDB' }]
    });
  });

  it('preserves and sends only a local memory key changed before hydration', async () => {
    await reopen();
    useProjectMemoryStore.getState().updateMemory('technical', 'database', 'Local database');
    api.getProjectMemory.mockResolvedValue({
      entries: [
        { category: 'technical', key: 'database', value: 'Database value' },
        { category: 'technical', key: 'hosting', value: 'Cloud Run' }
      ]
    });

    await ensureProjectResources(['memory']);
    await pushNow();

    expect(useProjectMemoryStore.getState().memory.technical).toEqual({
      database: 'Local database',
      hosting: 'Cloud Run'
    });
    expect(api.upsertMemory).toHaveBeenCalledWith('proj-1', {
      entries: [{ category: 'technical', key: 'database', value: 'Local database' }]
    });
  });

  it('does not mark a local metadata edit as synchronized during metadata hydration', async () => {
    await reopen();
    useProjectStore.setState(state => ({ project: { ...state.project, name: 'Local renamed project' } }));
    api.getProjectMeta.mockResolvedValue({
      name: 'Registry Name', idea: 'Database idea'
    });

    await ensureProjectResources(['meta']);
    await pushNow();

    expect(useProjectStore.getState().project).toMatchObject({
      name: 'Local renamed project', idea: 'Database idea'
    });
    expect(api.updateProjectMeta).toHaveBeenCalledWith('proj-1', expect.objectContaining({
      name: 'Local renamed project'
    }));
  });

  it('marks every resource ready for a newly-created project and performs no hydration reads', async () => {
    expect(useProjectResourceStore.getState().projectId).toBe('proj-1');
    expect(Object.values(useProjectResourceStore.getState().resources).every(resource => resource.status === 'ready')).toBe(true);
    await ensureProjectResources(['meta', 'events', 'memory', 'decisions']);
    expect(api.getProjectMeta).not.toHaveBeenCalled();
    expect(api.getProjectEvents).not.toHaveBeenCalled();
    expect(api.getProjectMemory).not.toHaveBeenCalled();
    expect(api.getProjectDecisions).not.toHaveBeenCalled();
  });
});
