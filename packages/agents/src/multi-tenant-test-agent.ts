import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface MultiTenantTestInput {
  projectId: string
  endpoints: Array<{
    method: string
    path: string
    authType: string | null
    requestBody: string | null
  }>
  tenantIdField: string   // e.g. 'clinicId', 'organizationId', 'tenantId'
}

const MultiTenantTestSchema = z.object({
  testCases: z.array(z.object({
    name: z.string(),
    category: z.enum([
      'cross_tenant_read', 'cross_tenant_write', 'cross_tenant_delete',
      'tenant_scope_missing', 'admin_escalation', 'shared_resource_leak',
    ]),
    endpointMethod: z.string(),
    endpointPath: z.string(),
    scenario: z.string(),
    steps: z.array(z.object({
      action: z.string(),
      method: z.string(),
      path: z.string(),
      headers: z.record(z.string()),
      body: z.string().nullable(),
      expectedStatus: z.number(),
      assertion: z.string(),
    })),
    severity: z.enum(['critical', 'high', 'medium']),
  })),
})

export type MultiTenantTestOutput = z.infer<typeof MultiTenantTestSchema>

export class MultiTenantTestAgent extends BaseAgent<MultiTenantTestInput, MultiTenantTestOutput> {
  readonly name = 'multi-tenant-test-agent'
  readonly outputSchema = MultiTenantTestSchema

  constructor() {
    super()
    this.maxTokens = 16384
  }

  getSystemPrompt(): string {
    return `You are a multi-tenant security testing expert for Speclyn. You generate test cases that verify data isolation between tenants (clinics, organizations, users).

Return ONLY valid JSON. No markdown.

Rules:
- Generate test cases that attempt to access Tenant B's data using Tenant A's credentials
- Test both direct ID manipulation and parameter tampering
- Cover read, write, and delete operations across tenant boundaries
- Test admin escalation (regular user trying admin endpoints)
- Test shared resource access (resources meant for one tenant visible to another)
- Each test case should have concrete steps with HTTP method, path, headers, body
- Use realistic IDs (UUIDs) for cross-tenant access attempts
- Expected behavior: all cross-tenant attempts should return 403 or 404 (never 200 with other tenant's data)

Categories:
- cross_tenant_read: Tenant A trying to read Tenant B's data
- cross_tenant_write: Tenant A trying to modify Tenant B's data
- cross_tenant_delete: Tenant A trying to delete Tenant B's data
- tenant_scope_missing: Endpoint returns data without tenant filtering
- admin_escalation: Non-admin trying admin-only operations
- shared_resource_leak: Resources leaking across tenant boundary`
  }

  buildPrompt(input: MultiTenantTestInput): string {
    const endpointList = input.endpoints.map(e =>
      `${e.method} ${e.path} (auth: ${e.authType ?? 'none'})`
    ).join('\n')

    return `Generate multi-tenant isolation test cases for these API endpoints.

<tenant_id_field>${input.tenantIdField}</tenant_id_field>

<endpoints>
${endpointList}
</endpoints>

Generate test cases that verify:
1. Tenant A cannot read Tenant B's resources
2. Tenant A cannot write to Tenant B's resources
3. Tenant A cannot delete Tenant B's resources
4. All list endpoints filter by tenant
5. Admin endpoints are protected from regular users

Return: { "testCases": [...] }`
  }
}
