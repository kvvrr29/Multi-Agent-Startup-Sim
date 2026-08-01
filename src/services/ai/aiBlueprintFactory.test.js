import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aiProvider', () => ({ generateAIContent: vi.fn() }));

import { generateAIContent } from './aiProvider';
import { generateAgentContent } from './aiBlueprintFactory';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectMemoryStore } from '../../store/projectMemoryStore';

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.getState().reset();
  useProjectMemoryStore.getState().clearMemory();
  useProjectStore.getState().setProject({ name: 'TestCo', idea: 'A focused business product', budget: '$10k', targetAudience: 'Teams' });
});

describe('cloud batch revisions', () => {
  const text = 'Business model and revenue sales use pricing fees for a defined market opportunity. Budget funding controls cost expenses and risk threats while viability, margins, and growth support the target teams. ';

  it('asks only for the routed sections', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify({ businessModel: text }));

    const result = await generateAgentContent('ceo', 'switch to a commission model', ['businessModel']);

    const [, prompt, schema] = generateAIContent.mock.calls[0];
    expect(Object.keys(schema.properties)).toContain('businessModel');
    expect(Object.keys(schema.properties)).not.toContain('risksMitigation');
    expect(prompt).toMatch(/Markdown format: businessModel\./);
    expect(Object.keys(result.content)).toEqual(['businessModel']);
  });

  it('states the instruction in the task, not only in the context', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify({ businessModel: text }));

    await generateAgentContent('ceo', 'switch to a commission model', ['businessModel']);

    // Buried under a context heading the instruction reads as background and
    // the task still asks for a fresh write, so the existing text is lost.
    const task = generateAIContent.mock.calls[0][1].split('\n\nTask:')[1];
    expect(task).toMatch(/applies this instruction to its current text shown above: switch to a commission model/);
  });

  it('does not mention an instruction during initial generation', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify({
      executiveSummary: text, targetUsers: text, businessModel: text,
      budgetCostEstimate: text, risksMitigation: text
    }));

    await generateAgentContent('ceo');

    expect(generateAIContent.mock.calls[0][1]).not.toMatch(/Rewrite each one/);
  });
});

describe('AI generation retry', () => {
  it('includes the complete prior raw response and exact feedback on the only retry', async () => {
    const invalidRaw = JSON.stringify({ executiveSummary: 'too short', decisions: [] });
    const text = 'Business model and revenue sales use pricing fees for a defined market opportunity. Budget funding controls cost expenses and risk threats while viability, margins, and growth support the target teams. ';
    const validRaw = JSON.stringify({
      executiveSummary: text,
      targetUsers: text,
      businessModel: text,
      budgetCostEstimate: text,
      risksMitigation: text,
      decisions: [{ category: 'Business', key: 'pricing', value: 'Usage fee', rationale: 'Matches demand' }]
    });
    generateAIContent.mockResolvedValueOnce(invalidRaw).mockResolvedValueOnce(validRaw);

    const result = await generateAgentContent('ceo');
    expect(result.content.executiveSummary).toBe(text);
    expect(generateAIContent).toHaveBeenCalledTimes(2);
    const retryPrompt = generateAIContent.mock.calls[1][1];
    expect(retryPrompt).toContain(invalidRaw);
    expect(retryPrompt).toContain('Section "targetUsers" is missing');
    expect(retryPrompt).toContain('preserving the useful content');
  });
});
