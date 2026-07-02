import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface ContractTestInput {
  projectId: string
  endpointMethod: string
  endpointPath: string
  openApiSchema: string // JSON string of the response schema from OpenAPI spec
  actualResponse: string // JSON string of the actual API response
  statusCode: number
}

const ContractViolationSchema = z.object({
  violations: z.array(z.object({
    path: z.string(),
    expected: z.string(),
    actual: z.string(),
    severity: z.enum(['error', 'warning']),
    description: z.string(),
  })),
  isCompliant: z.boolean(),
  summary: z.string(),
})

export type ContractTestOutput = z.infer<typeof ContractViolationSchema>

export class ContractTestAgent extends BaseAgent<ContractTestInput, ContractTestOutput> {
  readonly name = 'contract-test-agent'
  readonly outputSchema = ContractViolationSchema
  protected override modelTier = 'haiku' as const

  getSystemPrompt(): string {
    return `You are an API contract testing expert for Speclyn. Compare an actual API response against an OpenAPI schema definition.

Return ONLY a valid JSON object. No markdown.

Rules:
- Check every field in the schema against the actual response
- Report missing required fields as "error" severity
- Report extra fields not in schema as "warning" severity
- Report type mismatches (string vs number, etc.) as "error"
- Report format mismatches (date-time, email, uri) as "warning"
- isCompliant = true only if zero "error" violations
- Be precise about JSON paths (e.g., "data[0].user.email")`
  }

  buildPrompt(input: ContractTestInput): string {
    return `Check if this API response conforms to its OpenAPI schema.

<endpoint>${input.endpointMethod} ${input.endpointPath} (HTTP ${input.statusCode})</endpoint>

<expected_schema>
${input.openApiSchema}
</expected_schema>

<actual_response>
${input.actualResponse.slice(0, 4000)}
</actual_response>

Return: { "violations": [...], "isCompliant": true/false, "summary": "..." }`
  }
}
