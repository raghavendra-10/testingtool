export interface AnalysisBudget {
  maxFiles: number
  maxInputTokens: number
  maxCostUsd: number
  maxWallClockMs: number
}

export interface BudgetTracker {
  filesProcessed: number
  tokensUsed: number
  costUsd: number
  startTime: number
}

export function createDefaultBudget(): AnalysisBudget {
  return {
    maxFiles: parseInt(process.env['CODE_ANALYSIS_MAX_FILES'] ?? '2000'),
    maxInputTokens: parseInt(process.env['CODE_ANALYSIS_MAX_INPUT_TOKENS'] ?? '5000000'),
    maxCostUsd: parseFloat(process.env['CODE_ANALYSIS_MAX_COST_USD'] ?? '25'),
    maxWallClockMs: parseInt(process.env['CODE_ANALYSIS_MAX_DURATION_MS'] ?? '2700000'), // 45 min
  }
}

export function isWithinBudget(tracker: BudgetTracker, budget: AnalysisBudget): boolean {
  if (tracker.filesProcessed >= budget.maxFiles) return false
  if (tracker.tokensUsed >= budget.maxInputTokens) return false
  if (tracker.costUsd >= budget.maxCostUsd) return false
  if (Date.now() - tracker.startTime >= budget.maxWallClockMs) return false
  return true
}

export function budgetExhaustedReason(tracker: BudgetTracker, budget: AnalysisBudget): string | null {
  if (tracker.filesProcessed >= budget.maxFiles) return `File limit reached (${budget.maxFiles})`
  if (tracker.tokensUsed >= budget.maxInputTokens) return `Token limit reached (${budget.maxInputTokens.toLocaleString()})`
  if (tracker.costUsd >= budget.maxCostUsd) return `Cost limit reached ($${budget.maxCostUsd})`
  if (Date.now() - tracker.startTime >= budget.maxWallClockMs) return `Time limit reached (${Math.round(budget.maxWallClockMs / 60000)}min)`
  return null
}

/** Estimate tokens from byte count (~3.5 bytes per token for code) */
export function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 3.5)
}
