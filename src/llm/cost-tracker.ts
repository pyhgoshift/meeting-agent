export interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Prices per 1M tokens (input / output)
const PRICING: Record<string, [number, number]> = {
  'deepseek-ai/deepseek-r1':         [0.55,  2.19],
  'deepseek-ai/deepseek-v3-0324':    [0.27,  1.10],
  'claude-haiku-4-5-20251001':       [0.80,  4.00],
  'claude-sonnet-5':                 [3.00, 15.00],
  'llama-3.3-70b-versatile':         [0.59,  0.79],
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const [inRate, outRate] = PRICING[model] ?? [1.00, 3.00];
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
}

// Rough token estimate: 1 token ≈ 3.5 chars for Korean
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
