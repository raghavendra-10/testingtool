import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface FailureClassifierInput {
  projectId: string
  stepId: string
  testName: string
  errorMessage: string
  errorType: string | null
  httpStatus: number | null
  responseBody: string | null
}

const ClassificationSchema = z.object({
  failureCategory: z.enum([
    'assertion_failure',
    'auth_error',
    'not_found',
    'server_error',
    'network_error',
    'timeout',
    'schema_mismatch',
    'missing_field',
    'unexpected_status',
    'unknown',
  ]),
  title: z.string().max(200),
  explanation: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
})

export type FailureClassification = z.infer<typeof ClassificationSchema>

export class FailureClassifierAgent extends BaseAgent<FailureClassifierInput, FailureClassification> {
  readonly name = 'failure-classifier-agent'
  readonly outputSchema = ClassificationSchema
  protected override modelTier = 'haiku' as const

  getSystemPrompt(): string {
    return `You are an API test failure analyst for Speclyn. Classify a test failure and produce a defect record.

Return ONLY a valid JSON object. No markdown.

Failure categories:
- assertion_failure: expect() assertion failed — response doesn't match expected
- auth_error: 401/403 — authentication or authorization problem
- not_found: 404 — endpoint or resource doesn't exist
- server_error: 500/502/503 — server-side bug
- network_error: connection refused, ECONNREFUSED, DNS failure
- timeout: request timed out
- schema_mismatch: response shape doesn't match expected schema
- missing_field: required field absent in response
- unexpected_status: got a 2xx but wrong specific code, or unexpected redirect
- unknown: cannot determine from available information`
  }

  buildPrompt(input: FailureClassifierInput): string {
    return `Classify this API test failure.

<failure>
Test: ${input.testName}
Error type: ${input.errorType ?? 'unknown'}
Error message: ${input.errorMessage}
HTTP status: ${input.httpStatus ?? 'N/A'}
Response body: ${input.responseBody ? input.responseBody.slice(0, 500) : 'N/A'}
</failure>

Return JSON with failureCategory, title (short defect title), explanation, severity.`
  }

  /** Deterministic pre-classification — use LLM only for ambiguous cases (§1.1) */
  static deterministicClassify(httpStatus: number | null, errorMessage: string): string | null {
    if (httpStatus === 401 || httpStatus === 403) return 'auth_error'
    if (httpStatus === 404) return 'not_found'
    if (httpStatus != null && httpStatus >= 500) return 'server_error'
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) return 'network_error'
    if (errorMessage.toLowerCase().includes('timeout')) return 'timeout'
    return null  // needs LLM
  }
}
