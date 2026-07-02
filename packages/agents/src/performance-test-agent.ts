import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface PerformanceTestInput {
  projectId: string
  endpoints: Array<{ method: string; path: string }>
  targetRps: number
  durationSeconds: number
}

const PerformanceTestSchema = z.object({
  script: z.string(),
  thresholds: z.object({
    p95LatencyMs: z.number(),
    p99LatencyMs: z.number(),
    errorRatePercent: z.number(),
  }),
  stages: z.array(z.object({
    duration: z.string(),
    target: z.number(),
  })),
})

export type PerformanceTestOutput = z.infer<typeof PerformanceTestSchema>

export class PerformanceTestAgent extends BaseAgent<PerformanceTestInput, PerformanceTestOutput> {
  readonly name = 'performance-test-agent'
  readonly outputSchema = PerformanceTestSchema

  getSystemPrompt(): string {
    return `You are a performance testing expert. Generate a k6 load test script.

Return ONLY valid JSON. No markdown.

Rules:
- Generate a complete k6 script as a string in the "script" field
- Include ramp-up, steady-state, and ramp-down stages
- Set thresholds for p95/p99 latency and error rate
- Use http.get/http.post/etc from k6/http module
- Include checks for response status codes
- Use __ENV.BASE_URL for the target URL`
  }

  buildPrompt(input: PerformanceTestInput): string {
    return `Generate a k6 load test script.

<endpoints>
${JSON.stringify(input.endpoints, null, 2)}
</endpoints>
<target_rps>${input.targetRps}</target_rps>
<duration_seconds>${input.durationSeconds}</duration_seconds>

Return: { "script": "...", "thresholds": {...}, "stages": [...] }`
  }
}
