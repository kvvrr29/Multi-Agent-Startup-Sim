import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai/aiBlueprintFactory', () => ({ generateAgentContent: vi.fn() }));

import { generateAgentContent } from './ai/aiBlueprintFactory';
import { applyRevisionSimulation } from './simulationEngine';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { useSettingsStore } from '../store/useSettingsStore';

const preview = (tasks) => ({ instruction: 'Apply requested changes', confidence: 'High', tasks });
const result = (content) => ({ content, decisions: [], scores: { overall: 90 }, generationSource: 'Gemini' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useSettingsStore.getState().setAiModeEnabled(true);
  useProjectStore.getState().updateBlueprintSection('businessModel', 'Original business model content');
  useProjectStore.getState().updateBlueprintSection('technologyStack', 'Original technology stack content');
});

afterEach(() => vi.useRealTimers());

const settle = async (promise) => {
  await vi.runAllTimersAsync();
  return promise;
};

describe('revision workflow outcomes', () => {
  it('reports a clear error and changes nothing when all tasks fail', async () => {
    generateAgentContent.mockRejectedValue(new Error('provider unavailable'));
    const promise = applyRevisionSimulation(preview([
      { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Change pricing', reason: '' },
      { agent: 'developer', sections: ['technologyStack'], taskDescription: 'Change backend', reason: '' }
    ]));
    const workflow = await settle(promise);
    expect(workflow.status).toBe('failed');
    expect(useProjectStore.getState().blueprint.businessModel.content).toBe('Original business model content');
    expect(useProjectStore.getState().workflow.active).toBe(false);
  });

  it('applies changes only for sections that actually changed', async () => {
    generateAgentContent.mockImplementation((agent) => agent === 'ceo'
      ? Promise.resolve(result({ businessModel: 'Changed business model content' }))
      : Promise.reject(new Error('developer failed')));
    const promise = applyRevisionSimulation(preview([
      { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Change pricing', reason: '' },
      { agent: 'developer', sections: ['technologyStack'], taskDescription: 'Change backend', reason: '' }
    ]));
    const workflow = await settle(promise);
    expect(workflow.status).toBe('partial');
    expect(workflow.taskResults.map(item => item.status)).toEqual(['changed', 'failed']);
    expect(workflow.changes).toEqual(['Business Model Updated']);
    expect(useProjectStore.getState().blueprint.businessModel.content).toBe('Changed business model content');
    expect(useProjectStore.getState().blueprint.technologyStack.content).toBe('Original technology stack content');
  });

  it('reports "unchanged" for output identical to the current content', async () => {
    generateAgentContent.mockResolvedValue(result({ businessModel: 'Original business model content' }));
    const workflow = await settle(applyRevisionSimulation(preview([
      { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Keep pricing', reason: '' }
    ])));
    expect(workflow.status).toBe('unchanged');
  });

  it('rejects duplicate submission while the shared workflow lock is active', async () => {
    generateAgentContent.mockResolvedValue(result({ businessModel: 'Changed business model content' }));
    const first = applyRevisionSimulation(preview([
      { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Change pricing', reason: '' }
    ]));
    const duplicate = await applyRevisionSimulation(preview([
      { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Second request', reason: '' }
    ]));
    expect(duplicate.status).toBe('failed');
    const workflow = await settle(first);
    expect(workflow.status).toBe('success');
    expect(useProjectStore.getState().blueprint.businessModel.content).toBe('Changed business model content');
  });

  it('times out a task without applying its late result', async () => {
    generateAgentContent.mockReturnValue(new Promise(() => {}));
    const workflow = await settle(applyRevisionSimulation(preview([
      { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Slow request', reason: '' }
    ])));
    expect(workflow.status).toBe('failed');
    expect(useProjectStore.getState().blueprint.businessModel.content).toBe('Original business model content');
  });
});
