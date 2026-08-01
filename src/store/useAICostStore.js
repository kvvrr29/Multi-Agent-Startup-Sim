import { create } from 'zustand';
const INPUT_COST_PER_TOKEN = 0.075 / 1000000;
const OUTPUT_COST_PER_TOKEN = 0.30 / 1000000;

export const useAICostStore = create((set) => ({
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
