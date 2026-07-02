import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface SecurityTestInput {
  projectId: string
  endpointMethod: string
  endpointPath: string
  requestBody: string | null
  authType: string | null
}

const SecurityTestSchema = z.object({
  testCases: z.array(z.object({
    name: z.string(),
    category: z.enum(['sql_injection', 'xss', 'idor', 'auth_bypass', 'csrf', 'rate_limiting', 'data_exposure', 'header_injection']),
    payload: z.string(),
    injectionPoint: z.enum(['query', 'body', 'header', 'path']),
    expectedBehavior: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
  })),
})

export type SecurityTestOutput = z.infer<typeof SecurityTestSchema>

export class SecurityTestAgent extends BaseAgent<SecurityTestInput, SecurityTestOutput> {
  readonly name = 'security-test-agent'
  readonly outputSchema = SecurityTestSchema

  getSystemPrompt(): string {
    return `You are a security testing expert for Speclyn. Generate OWASP Top 10 test cases for an API endpoint.

Return ONLY valid JSON. No markdown.

Rules:
- Generate 3-6 test cases covering different OWASP categories
- Include SQL injection payloads for query/body params
- Include XSS payloads for text inputs
- Test IDOR by accessing resources with different IDs
- Test auth bypass by omitting/modifying tokens
- Test rate limiting by specifying burst requests
- Never generate destructive payloads — test detection, not exploitation`
  }

  buildPrompt(input: SecurityTestInput): string {
    return `Generate security test cases for this endpoint.

<endpoint>${input.endpointMethod} ${input.endpointPath}</endpoint>
<auth_type>${input.authType ?? 'unknown'}</auth_type>
<request_body>${input.requestBody ?? 'none'}</request_body>

Return: { "testCases": [...] }`
  }
}
