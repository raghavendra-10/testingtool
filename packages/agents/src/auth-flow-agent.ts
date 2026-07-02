import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface AuthFlowInput {
  projectId: string
  authType: 'oauth2_client_credentials' | 'oauth2_auth_code' | 'bearer_token' | 'basic_auth' | 'api_key'
  endpoints: Array<{ method: string; path: string; requiresAuth: boolean }>
  tokenEndpoint?: string
  authEndpoint?: string
}

const AuthFlowTestSchema = z.object({
  testCases: z.array(z.object({
    name: z.string(),
    description: z.string(),
    scenario: z.enum(['valid_auth', 'expired_token', 'invalid_token', 'missing_auth', 'wrong_scope', 'token_refresh']),
    steps: z.array(z.object({
      action: z.string(),
      method: z.string(),
      path: z.string(),
      headers: z.record(z.string()).optional(),
      expectedStatus: z.number(),
      assertions: z.array(z.string()),
    })),
  })),
})

export type AuthFlowOutput = z.infer<typeof AuthFlowTestSchema>

export class AuthFlowTestAgent extends BaseAgent<AuthFlowInput, AuthFlowOutput> {
  readonly name = 'auth-flow-test-agent'
  readonly outputSchema = AuthFlowTestSchema

  getSystemPrompt(): string {
    return `You are an authentication testing expert for Speclyn. Generate test cases for API authentication flows.

Return ONLY a valid JSON object. No markdown.

Test scenarios to cover:
- valid_auth: Correct credentials should grant access
- expired_token: Expired tokens should be rejected with 401
- invalid_token: Malformed tokens should be rejected with 401
- missing_auth: Requests without credentials should get 401
- wrong_scope: Valid token but insufficient permissions → 403
- token_refresh: Refresh flow should return new valid token

Rules:
- Each test case has multi-step flows (e.g., get token → use token → verify)
- Never hardcode actual credentials — use placeholder references
- Include assertions for response body structure, not just status codes
- Maximum 8 test cases total`
  }

  buildPrompt(input: AuthFlowInput): string {
    return `Generate authentication flow test cases.

<auth_type>${input.authType}</auth_type>
${input.tokenEndpoint ? `<token_endpoint>${input.tokenEndpoint}</token_endpoint>` : ''}
${input.authEndpoint ? `<auth_endpoint>${input.authEndpoint}</auth_endpoint>` : ''}

<protected_endpoints>
${JSON.stringify(input.endpoints, null, 2)}
</protected_endpoints>

Return: { "testCases": [...] }`
  }
}
