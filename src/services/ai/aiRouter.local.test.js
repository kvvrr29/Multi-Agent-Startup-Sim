import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aiProvider', () => ({ generateAIContent: vi.fn() }));

import { generateAIContent } from './aiProvider';
import { routeAIRevision } from './aiRouter';
import { useSettingsStore } from '../../store/useSettingsStore';
import { JSON_ONLY_DIRECTIVE, withJsonHardening } from './agentPrompts';
import { getProviderProfile } from './providerProfiles';

const validRouting = {
  tasks: [{
    agent: 'ceo',
    sections: ['businessModel'],
    taskDescription: 'Lower the pricing',
    reason: 'Pricing is a business decision.'
  }],
  confidence: 'High'
};

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ aiProvider: 'gemini' });
});

afterEach(() => {
  useSettingsStore.setState({ aiProvider: 'gemini' });
});

describe('revision routing across providers', () => {
  it('sends Gemini its own Type enum dialect', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify(validRouting));
    await routeAIRevision('make pricing cheaper');

    const schema = generateAIContent.mock.calls[0][2];
    expect(schema.type).toBe('OBJECT');
    expect(schema.properties.tasks.type).toBe('ARRAY');
    expect(schema.properties.confidence.type).toBe('STRING');
  });

  it('sends the local model standard JSON Schema', async () => {
    useSettingsStore.setState({ aiProvider: 'webllm' });
    generateAIContent.mockResolvedValue(JSON.stringify(validRouting));
    await routeAIRevision('make pricing cheaper');

    const schema = generateAIContent.mock.calls[0][2];
    expect(schema.type).toBe('object');
    expect(schema.properties.tasks.items.type).toBe('object');
    expect(schema.properties.tasks.items.properties.sections.items.type).toBe('string');
  });

  it('sends OpenAI standard JSON Schema too', async () => {
    useSettingsStore.setState({ aiProvider: 'openai' });
    generateAIContent.mockResolvedValue(JSON.stringify(validRouting));
    await routeAIRevision('make pricing cheaper');

    expect(generateAIContent.mock.calls[0][2].type).toBe('object');
  });

  it('recovers routing wrapped in code fences instead of falling back to keywords', async () => {
    useSettingsStore.setState({ aiProvider: 'webllm' });
    generateAIContent.mockResolvedValue('```json\n' + JSON.stringify(validRouting) + '\n```');

    const result = await routeAIRevision('make pricing cheaper');

    // The AI answer survived; the heuristic fallback reports 'Low (Fallback)'.
    expect(result.confidence).toBe('High');
    expect(result.assignedAgents).toEqual(['ceo']);
    expect(result.affectedSections).toEqual(['businessModel']);
  });

  it('still falls back to the keyword heuristic when nothing parses', async () => {
    useSettingsStore.setState({ aiProvider: 'webllm' });
    generateAIContent.mockResolvedValue('I cannot help with that.');

    const result = await routeAIRevision('make pricing cheaper');
    expect(result.confidence).toBe('Low (Fallback)');
    expect(result.assignedAgents).toContain('ceo');
  });
});

describe('JSON hardening is local-only', () => {
  it('appends the directive for the local model', async () => {
    useSettingsStore.setState({ aiProvider: 'webllm' });
    generateAIContent.mockResolvedValue(JSON.stringify(validRouting));
    await routeAIRevision('make pricing cheaper');

    expect(generateAIContent.mock.calls[0][0]).toContain(JSON_ONLY_DIRECTIVE);
  });

  it('leaves cloud prompts untouched', async () => {
    for (const provider of ['gemini', 'openai']) {
      vi.clearAllMocks();
      useSettingsStore.setState({ aiProvider: provider });
      generateAIContent.mockResolvedValue(JSON.stringify(validRouting));
      await routeAIRevision('make pricing cheaper');

      expect(generateAIContent.mock.calls[0][0]).not.toContain(JSON_ONLY_DIRECTIVE);
    }
  });

  it('withJsonHardening returns the prompt unchanged for cloud profiles', () => {
    const prompt = 'You are the CEO.';
    expect(withJsonHardening(prompt, getProviderProfile('gemini'))).toBe(prompt);
    expect(withJsonHardening(prompt, getProviderProfile('openai'))).toBe(prompt);
    expect(withJsonHardening(prompt, getProviderProfile('webllm'))).toContain(JSON_ONLY_DIRECTIVE);
    // Never throws on a missing profile.
    expect(withJsonHardening(prompt, undefined)).toBe(prompt);
  });
});
