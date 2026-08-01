import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aiProvider', () => ({ generateAIContent: vi.fn() }));

import { generateAIContent } from './aiProvider';
import { generateAgentContent } from './aiBlueprintFactory';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAIDebugStore } from '../../store/useAIDebugStore';
const sectionText = (name) =>
  `The ${name} section describes the core problem urban customers face and the solution this platform delivers. `
  + `Target users are students and working professionals in dense city demographics whose daily habits and spend patterns show a clear need for faster delivery. `
  + `The business model earns revenue through commission pricing on each order, with unit economics that keep cost per delivery below the customer contribution margin. `
  + `The budget allocates salary for a small engineering team, cloud infrastructure and hosting tooling, and a total monthly estimate with contingency. `
  + `Key risks include competition, regulatory and privacy exposure, and technical scaling delays; each has a mitigation owner. `
  + `The frontend is React, the backend is Node with a REST api, the database is Postgres, and we deploy to cloud infrastructure with Docker. `
  + `Marketing reaches that audience through social media channels, a launch campaign with clear positioning, and acquisition funnels measured on retention and growth. `
  + `The value and advantage of this approach is a defined mvp scope of core features and a roadmap phase plan across quarters, with milestones every month.`;

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

  it('sends the full cloud context with a per-section task and token budget', async () => {
    generateAIContent.mockImplementation((_system, prompt) => {
      const key = ['executiveSummary', 'targetUsers', 'businessModel', 'budgetCostEstimate', 'risksMitigation']
        .find(k => prompt.includes(k));
      return Promise.resolve(respondWithSection(key));
    });

    await generateAgentContent('ceo');

    const [, prompt, schema, maxTokens] = generateAIContent.mock.calls[0];
    expect(prompt).not.toMatch(/generate the following blueprint sections/);
    expect(prompt).toMatch(/Respond with ONLY valid JSON/);
    expect(maxTokens).toBeGreaterThan(0);
    expect(prompt).toMatch(/Urban food delivery/);
    expect(prompt).toMatch(/at least 350 words/);
    expect(prompt).toMatch(/Cover concepts such as: problem, solution, customer, value\./);
    expect(prompt).toMatch(/PROJECT MEMORY/);
    expect(prompt).toMatch(/CURRENT BLUEPRINT STATE/);
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
    expect(generateAIContent).toHaveBeenCalledTimes(1);
    expect(result.content.architecture).toMatch(/```mermaid/);
    expect(result.content.umlDiagram).toMatch(/```mermaid/);
    expect(result.content.erDiagram).toMatch(/erDiagram/);
  });

  it('shows the local model the current section text when revising it', async () => {
    const existing = 'The current go-to-market plan leans on campus ambassadors and paid social.';
    useProjectStore.getState().updateBlueprintSection('marketingStrategy', existing, 'pending');
    generateAIContent.mockResolvedValue(JSON.stringify({ marketingStrategy: sectionText('marketingStrategy') }));

    await generateAgentContent('marketing', 'make this section bigger');

    const prompt = generateAIContent.mock.calls[0][1];
    expect(prompt).toContain(existing);
    expect(prompt).toMatch(/Apply this instruction to the current text shown above: make this section bigger/);
    expect(prompt).not.toMatch(/Project Name: make this section bigger/);
  });

  it('keeps best-effort content when a section never fully validates', async () => {
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

  it('writes only the routed sections on a revision', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify({ businessModel: sectionText('businessModel') }));

    const result = await generateAgentContent('ceo', 'switch to a commission model', ['businessModel']);
    expect(generateAIContent).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.content)).toEqual(['businessModel']);
    expect(generateAIContent.mock.calls[0][1]).toMatch(/switch to a commission model/);
  });

  it('refuses a routed set the agent does not own', async () => {
    await expect(generateAgentContent('ceo', 'change the stack', ['technologyStack']))
      .rejects.toThrow(/No section owned by ceo/);
    expect(generateAIContent).not.toHaveBeenCalled();
  });

  it('replaces the length target instead of contradicting it after a truncation', async () => {
    const truncated = Object.assign(new Error('truncated at budget'), { isTruncated: true, partialText: '{"marketingStrategy": "Ads' });
    generateAIContent
      .mockRejectedValueOnce(truncated)
      .mockResolvedValueOnce(JSON.stringify({ marketingStrategy: sectionText('marketingStrategy') }));

    await generateAgentContent('marketing');

    const [first, second] = generateAIContent.mock.calls.map(call => call[1]);
    expect(first).toMatch(/at least 350 words/);
    expect(second).not.toMatch(/at least 350 words/);
    expect(second).toMatch(/2 to 3 compact paragraphs/);
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
    expect(generateAIContent).toHaveBeenCalledTimes(1);
    expect(result.generationSource).toBe('Gemini');
    expect(generateAIContent.mock.calls[0][1]).toMatch(/generate the following blueprint sections/);
  });
});
