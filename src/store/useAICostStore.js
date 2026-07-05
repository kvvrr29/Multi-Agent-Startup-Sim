import { create } from 'zustand';

// Simple heuristic: 1 token ~ 4 chars for English text
// Gemini 2.5 Flash costs around $0.075 per 1M input tokens, and $0.30 per 1M output tokens (approximate)
const INPUT_COST_PER_TOKEN = 0.075 / 1000000;
const OUTPUT_COST_PER_TOKEN = 0.30 / 1000000;

export const useAICostStore = create((set, get) => ({
  totalRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0,

  recordUsage: (inputTokens, outputTokens) => set((state) => {
    const cost = (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN);
    return {
      totalRequests: state.totalRequests + 1,
      totalInputTokens: state.totalInputTokens + inputTokens,
      totalOutputTokens: state.totalOutputTokens + outputTokens,
      totalCost: state.totalCost + cost
    };
  }),

  reset: () => set({
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0
  })
}));
