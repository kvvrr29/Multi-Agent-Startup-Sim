/**
 * The 4-chars-per-token heuristic, shared by the cost tracker, the context
 * budget and the provider diagnostics so they cannot drift apart.
 *
 * It only has to be good enough to decide whether the blueprint state needs
 * trimming and to report rough usage; getMaxContextTokens leaves slack for it
 * being wrong.
 */
export const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);
