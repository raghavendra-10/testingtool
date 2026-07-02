/**
 * Evidence client — posts step events back to the API during test execution.
 * The agent runner injects SPECLYN_EVIDENCE_URL and SPECLYN_RUN_ID as env vars.
 */

export interface StepEvidencePayload {
  stepIndex: number
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  request?: unknown
  response?: unknown
  errorMessage?: string
}

export function createEvidenceClient() {
  const baseUrl = process.env['SPECLYN_EVIDENCE_URL']
  const runId = process.env['SPECLYN_RUN_ID']

  if (!baseUrl || !runId) {
    // In dry-run / local dev, evidence posting is a no-op
    return {
      postStep: async (_payload: StepEvidencePayload) => {},
    }
  }

  return {
    async postStep(payload: StepEvidencePayload): Promise<void> {
      const res = await fetch(`${baseUrl}/runs/${runId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        // Non-fatal: log and continue — never let evidence posting abort a test
        console.warn(`[evidence] Failed to post step ${payload.stepIndex}: ${res.status}`)
      }
    },
  }
}
