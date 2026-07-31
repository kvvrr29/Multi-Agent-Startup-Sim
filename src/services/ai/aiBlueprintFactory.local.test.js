import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aiProvider', () => ({ generateAIContent: vi.fn() }));

import { generateAIContent } from './aiProvider';
import { generateAgentContent } from './aiBlueprintFactory';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';

// Content thin enough that the strict cloud gates would reject it, which is
// exactly the regime the local model operates in.
const sectionText = (name) =>
  `The ${name} covers revenue, pricing and commission for urban delivery customers, with budget, cost and risk mitigation noted.`;

const respondWithSection = (key) => JSON.stringify({ [key]: sectionText(key) });

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useProjectStore.getState().setProject({ name: 'TestCo', idea: 'Urban food delivery', budget: '$10k', targetAudience: 'Commuters' });
  useSettingsStore.setState({ aiProvider: 'webllm' });
});

afterEach(() => {
  useSettingsStore.setState({ aiProvider: 'gemini' });
});

describe('per-section generation for the local model', () => {
  it('makes one call per section and merges the results', async () => {
    generateAIContent.mockImplementation((_system, prompt) => {
      const key = ['executiveSummary', 'targetUsers', 'businessModel', 'budgetCostEstimate', 'risksMitigation']
        .find(k => prompt.includes(k));
      return Promise.resolve(respondWithSection(key));
    });

    const result = await generateAgentContent('ceo');

    expect(generateAIContent).toHaveBeenCalledTimes(5);
    expect(Object.keys(result.content).sort()).toEqual(
      ['budgetCostEstimate', 'businessModel', 'executiveSummary', 'risksMitigation', 'targetUsers']
    );
    expect(result.generationSource).toBe('Built-in AI');
  });

  it('sends a compact prompt with a per-section token budget', async () => {
    generateAIContent.mockImplementation((_system, prompt) => {
      const key = ['executiveSummary', 'targetUsers', 'businessModel', 'budgetCostEstimate', 'risksMitigation']
        .find(k => prompt.includes(k));
      return Promise.resolve(respondWithSection(key));
    });

    await generateAgentContent('ceo');

    const [, prompt, schema, maxTokens] = generateAIContent.mock.calls[0];
    // Slim: nothing like the multi-section batch prompt.
    expect(prompt).not.toMatch(/generate the following blueprint sections/);
    expect(prompt).toMatch(/Respond ONLY with valid JSON/);
    expect(maxTokens).toBeGreaterThan(0);
    // Single-section schema, in the dialect a local model understands.
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toContain('executiveSummary');
    expect(Object.keys(schema.properties)).not.toContain('targetUsers');
  });

  it('uses template diagrams instead of asking the model for mermaid', async () => {
    generateAIContent.mockImplementation((_system, prompt) => {
      const key = ['architecture', 'technologyStack', 'umlDiagram', 'erDiagram'].find(k => prompt.includes(k));
      return Promise.resolve(respondWithSection(key));
    });

    const result = await generateAgentContent('developer');

    // Only technologyStack is asked for; the three diagram sections are templated.
    expect(generateAIContent).toHaveBeenCalledTimes(1);
    expect(result.content.architecture).toMatch(/```mermaid/);
    expect(result.content.umlDiagram).toMatch(/```mermaid/);
    expect(result.content.erDiagram).toMatch(/erDiagram/);
  });

  it('keeps best-effort content when a section never fully validates', async () => {
    // Always returns content too short to clear even the relaxed structural gate.
    generateAIContent.mockResolvedValue(JSON.stringify({ marketingStrategy: 'Ads.' }));

    const result = await generateAgentContent('marketing');

    expect(result.content.marketingStrategy).toBe('Ads.');
    expect(generateAIContent).toHaveBeenCalledTimes(2); // one retry, then kept
  });

  it('throws only when no section produces anything usable', async () => {
    generateAIContent.mockResolvedValue('the model refused to answer');

    await expect(generateAgentContent('marketing')).rejects.toThrow(/No section could be generated/);
    expect(useAIDebugStore.getState().generationSources.marketing).toBe('Fallback');
  });

  it('leaves the batch strategy untouched for cloud providers', async () => {
    useSettingsStore.setState({ aiProvider: 'gemini' });
    const text = 'Business model and revenue sales use pricing fees for a defined market opportunity. Budget funding controls cost expenses and risk threats while viability, margins, and growth support the target teams. ';
    generateAIContent.mockResolvedValue(JSON.stringify({
      executiveSummary: text, targetUsers: text, businessModel: text,
      budgetCostEstimate: text, risksMitigation: text,
      decisions: [{ category: 'Business', key: 'pricing', value: 'Usage fee', rationale: 'Matches demand' }]
    }));

    const result = await generateAgentContent('ceo');

    // One call covering every section, not five.
    expect(generateAIContent).toHaveBeenCalledTimes(1);
    expect(result.generationSource).toBe('Gemini');
    expect(generateAIContent.mock.calls[0][1]).toMatch(/generate the following blueprint sections/);
  });
});
