import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./aiProvider', () => ({
  generateAIContent: vi.fn()
}));

import { generateAIContent } from './aiProvider';
import { routeAIRevision, heuristicRouting, normalizeRouting } from './aiRouter';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeRouting', () => {
  it('drops tasks with unknown agents or sections', () => {
    const res = normalizeRouting([
      { agent: 'ceo', sections: ['businessModel', 'notARealSection'], taskDescription: 'x', reason: 'y' },
      { agent: 'intern', sections: ['businessModel'], taskDescription: 'x', reason: 'y' },
      { agent: 'pm', sections: [], taskDescription: 'x', reason: 'y' }
    ], 'High');
    expect(res.tasks).toHaveLength(1);
    expect(res.tasks[0].agent).toBe('ceo');
    expect(res.tasks[0].sections).toEqual(['businessModel']);
    expect(res.affectedSections).toEqual(['businessModel']);
    expect(res.assignedAgents).toEqual(['ceo']);
  });

  it('drops sections not owned by the declared agent and merges duplicate agent tasks', () => {
    const res = normalizeRouting([
      { agent: 'ceo', sections: ['businessModel', 'architecture'], taskDescription: 'Change pricing', reason: 'Business' },
      { agent: 'ceo', sections: ['budgetCostEstimate'], taskDescription: 'Reduce budget', reason: 'Cost' }
    ]);
    expect(res.tasks).toHaveLength(1);
    expect(res.tasks[0].sections).toEqual(['businessModel', 'budgetCostEstimate']);
    expect(res.tasks[0].sections).not.toContain('architecture');
  });
});

describe('heuristicRouting', () => {
  it('routes pricing requests to the CEO', () => {
    const res = heuristicRouting('Reduce the price of the subscription');
    expect(res.assignedAgents).toEqual(['ceo']);
    expect(res.tasks[0].reason).toMatch(/pricing\/budget/);
  });

  it('routes tech requests to the developer', () => {
    const res = heuristicRouting('Use Python for the backend');
    expect(res.assignedAgents).toEqual(['developer']);
    expect(res.affectedSections).toContain('technologyStack');
  });

  it('routes audience requests to marketing', () => {
    const res = heuristicRouting('Target students instead');
    expect(res.assignedAgents).toEqual(['marketing']);
  });

  it('defaults to the PM with low confidence', () => {
    const res = heuristicRouting('Make it nicer');
    expect(res.assignedAgents).toEqual(['pm']);
    expect(res.confidence).toMatch(/Low/);
  });

  it('detects every independent intent without AI', () => {
    const res = heuristicRouting('Reduce budget, use Python for the backend, and target students in the launch campaign');
    expect(res.assignedAgents).toEqual(['ceo', 'developer', 'marketing']);
  });

  it('uses a category hint when the text is ambiguous', () => {
    const res = heuristicRouting('Make the plan more focused', 'Technical');
    expect(res.assignedAgents).toEqual(['developer']);
  });
});

describe('routeAIRevision', () => {
  it('parses and normalizes an AI multi-task routing response', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify({
      tasks: [
        { agent: 'ceo', sections: ['businessModel'], taskDescription: 'Lower the price', reason: 'Pricing is a business decision' },
        { agent: 'developer', sections: ['technologyStack'], taskDescription: 'Switch backend to Python', reason: 'Technology change' }
      ],
      confidence: 'High'
    }));

    const res = await routeAIRevision('Lower the price and switch to Python', 'FoodTech');
    expect(res.tasks).toHaveLength(2);
    expect(res.assignedAgents).toEqual(['ceo', 'developer']);
    expect(res.affectedSections).toEqual(['businessModel', 'technologyStack']);
    expect(res.confidence).toBe('High');
  });

  it('falls back to the heuristic when the AI call fails', async () => {
    generateAIContent.mockRejectedValue(new Error('network down'));
    const res = await routeAIRevision('Reduce budget');
    expect(res.assignedAgents).toEqual(['ceo']);
    expect(res.confidence).toMatch(/Fallback/);
  });

  it('falls back when the AI returns no valid tasks', async () => {
    generateAIContent.mockResolvedValue(JSON.stringify({ tasks: [{ agent: 'nobody', sections: ['nothing'], taskDescription: '', reason: '' }], confidence: 'High' }));
    const res = await routeAIRevision('Use Python');
    expect(res.assignedAgents).toEqual(['developer']);
    expect(res.confidence).toMatch(/Fallback/);
  });
});
