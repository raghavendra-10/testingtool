import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface HIPAAComplianceInput {
  projectId: string
  endpoints: Array<{
    method: string
    path: string
    requestBody: string | null
    responses: string | null
  }>
  hasAuditLog: boolean
}

const HIPAATestSchema = z.object({
  testCases: z.array(z.object({
    name: z.string(),
    category: z.enum([
      'phi_exposure', 'audit_trail', 'access_control',
      'data_encryption', 'minimum_necessary', 'error_leakage',
    ]),
    endpointMethod: z.string(),
    endpointPath: z.string(),
    description: z.string(),
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
    hipaaRule: z.string(),
  })),
  recommendations: z.array(z.object({
    category: z.string(),
    finding: z.string(),
    recommendation: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
  })),
})

export type HIPAAComplianceOutput = z.infer<typeof HIPAATestSchema>

export class HIPAAComplianceAgent extends BaseAgent<HIPAAComplianceInput, HIPAAComplianceOutput> {
  readonly name = 'hipaa-compliance-agent'
  readonly outputSchema = HIPAATestSchema

  constructor() {
    super()
    this.maxTokens = 16384
  }

  getSystemPrompt(): string {
    return `You are a HIPAA compliance testing expert for Speclyn. You generate test cases that verify healthcare applications properly protect PHI (Protected Health Information) and comply with HIPAA regulations.

Return ONLY valid JSON. No markdown.

HIPAA rules to test:

**phi_exposure** (164.502) — Verify PHI is not exposed:
- SSN, DOB, diagnosis codes, insurance IDs not in error messages
- PHI fields masked/redacted in API responses where not needed
- PHI not in URL parameters or query strings
- PHI not in response headers

**audit_trail** (164.312(b)) — Verify audit logging:
- All PHI access is logged
- Create/read/update/delete operations on patient records logged
- Audit logs include who, what, when, from where
- Audit logs are immutable

**access_control** (164.312(a)) — Verify access controls:
- Authentication required for all PHI endpoints
- Role-based access to PHI (doctor vs nurse vs admin vs billing)
- Patient can only see own records
- Provider can only see assigned patients
- Break-glass access properly logged

**data_encryption** (164.312(a)(2)(iv)) — Verify encryption:
- PHI encrypted in transit (HTTPS)
- PHI encrypted at rest
- Encryption algorithm is strong (AES-256, not DES/3DES)

**minimum_necessary** (164.502(b)) — Verify minimum necessary:
- API returns only necessary PHI fields
- List endpoints don't return full patient records
- Search results don't include unnecessary PHI
- Bulk exports require authorization

**error_leakage** (164.530(f)) — Verify error handling:
- Error messages don't contain PHI
- Stack traces don't contain PHI
- 500 errors don't dump patient data
- Validation errors don't echo back PHI

For each test case, include the specific HIPAA rule reference.
Generate both automated tests and compliance recommendations.`
  }

  buildPrompt(input: HIPAAComplianceInput): string {
    const endpointList = input.endpoints.map(e =>
      `${e.method} ${e.path}${e.requestBody ? ` body: ${e.requestBody.slice(0, 200)}` : ''}`
    ).join('\n')

    return `Generate HIPAA compliance test cases for these API endpoints.

<has_audit_log>${input.hasAuditLog}</has_audit_log>

<endpoints>
${endpointList}
</endpoints>

Generate test cases that verify:
1. PHI is not exposed in error messages, logs, or unnecessary response fields
2. All PHI access is audit-logged
3. Access controls enforce role-based and ownership-based restrictions
4. Error responses don't leak PHI
5. Only minimum necessary PHI is returned

Also provide general HIPAA compliance recommendations based on the API structure.

Return: { "testCases": [...], "recommendations": [...] }`
  }
}
