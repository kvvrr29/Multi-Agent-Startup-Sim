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
