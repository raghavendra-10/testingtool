/**
 * Bedrock model pricing (per 1M tokens, USD).
 * Updated periodically — check https://aws.amazon.com/bedrock/pricing/
 */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  // Claude Sonnet variants
  'anthropic.claude-sonnet-5': { input: 3.0, output: 15.0 },
  'anthropic.claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'anthropic.claude-sonnet-4-20250514-v1:0': { input: 3.0, output: 15.0 },
  'us.anthropic.claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 3.0, output: 15.0 },

  // Claude Haiku variants
  'anthropic.claude-haiku-4-5-20251001-v1:0': { input: 0.25, output: 1.25 },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': { input: 0.25, output: 1.25 },
}

const DEFAULT_PRICE = { input: 3.0, output: 15.0 } // assume Sonnet pricing for unknown models

/**
 * Estimate cost in USD for a Bedrock model call.
 */
export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES[modelId] ?? DEFAULT_PRICE
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}
