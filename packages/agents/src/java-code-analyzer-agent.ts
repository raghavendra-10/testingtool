import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface JavaCodeAnalyzerInput {
  projectId: string
  fileName: string
  fileContent: string
  language: string
  analysisTypes: string[]
}

const IssueSchema = z.object({
  category: z.enum([
    'code_structure', 'api_pattern', 'auth_security', 'sql_security',
    'hardcoded_secret', 'input_validation', 'error_handling', 'logging',
    'deprecated_usage', 'naming_convention', 'transaction_handling',
    'data_exposure', 'encryption', 'multi_tenant', 'hipaa',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string(),
  description: z.string(),
  lineNumber: z.number().nullable(),
  codeSnippet: z.string().nullable(),
  recommendation: z.string(),
  ruleId: z.string(),
})

const JavaCodeAnalyzerSchema = z.object({
  issues: z.array(IssueSchema),
})

export type JavaCodeAnalyzerOutput = z.infer<typeof JavaCodeAnalyzerSchema>

export class JavaCodeAnalyzerAgent extends BaseAgent<JavaCodeAnalyzerInput, JavaCodeAnalyzerOutput> {
  readonly name = 'java-code-analyzer-agent'
  readonly outputSchema = JavaCodeAnalyzerSchema

  constructor() {
    super()
    this.maxTokens = 16384
  }

  getSystemPrompt(): string {
    return `You are an expert static code analyzer for Speclyn. You analyze source code files and find issues across multiple categories.

Return ONLY valid JSON. No markdown.

Categories you must check (based on the analysisTypes requested):

**code_structure** — Check for:
- Improper object structure / missing separation (DTO vs Entity vs Request vs Response)
- Missing or improper inheritance patterns
- Duplicate business logic
- God classes / methods too long (>50 lines)
- Reusable code not extracted into helpers

**api_pattern** — Check for:
- Missing Controller → Service → Repository layering
- Business logic in controllers
- Missing input validation before business logic
- Missing proper error handling / exception mapping
- Non-standard HTTP status codes
- Missing timeout handling for external calls
- Missing retry logic for external service calls
- Logging that exposes sensitive data (passwords, tokens, SSN, etc.)

**auth_security** — Check for:
- Missing authentication checks on endpoints
- Missing role-based access control
- Missing organization/clinic-level access checks
- Missing ownership validation (patient, appointment, etc.)
- JWT validation issues (missing expiry check, weak algorithms)
- Hardcoded roles or permissions
- Admin-only APIs not properly protected

**sql_security** — Check for:
- SQL injection vulnerabilities (string concatenation in queries)
- Missing parameterized queries / prepared statements
- SELECT * usage
- Missing pagination for large result sets
- Missing WHERE clauses for tenant/org filtering
- N+1 query patterns
- Missing transaction handling
- Missing rollback on failure
- Unnecessary nested queries

**hardcoded_secret** — Check for:
- Hardcoded passwords, API keys, tokens, connection strings
- Secrets not loaded from environment variables / vault
- Encryption keys in source code

**input_validation** — Check for:
- Missing null checks on inputs
- Missing field validation (email format, phone, date, amounts)
- Missing enum/status validation
- Missing request body size limits
- Missing file upload type/size validation

**error_handling** — Check for:
- Swallowed exceptions (empty catch blocks)
- Generic exception handling that hides root cause
- Stack traces exposed in API responses
- Missing error logging
- Inconsistent error response format

**logging** — Check for:
- Sensitive data in log messages (PII, PHI, passwords, tokens)
- Missing audit logging for create/update/delete operations
- Excessive debug logging in production paths

**deprecated_usage** — Check for:
- Deprecated Java APIs / libraries
- Deprecated framework methods
- End-of-life dependencies

**naming_convention** — Check for:
- Non-standard package naming
- Non-standard class/method naming
- Inconsistent naming patterns

**transaction_handling** — Check for:
- Missing @Transactional annotations
- Read operations marked as transactional (performance waste)
- Missing rollback rules
- Long-running transactions

**data_exposure** — Check for:
- Sensitive fields returned in API responses without filtering
- Missing @JsonIgnore on password/secret fields
- Full entity returned instead of DTO

**encryption** — Check for:
- Sensitive data stored without encryption
- Weak encryption algorithms
- Missing encryption at rest / in transit

**multi_tenant** — Check for:
- Missing tenant ID filtering in queries
- Cross-tenant data access possible
- Missing organization/clinic scoping
- Shared resources without proper isolation

**hipaa** — Check for:
- PHI fields not encrypted
- PHI in logs or error messages
- Missing audit trail for PHI access
- Missing access controls on PHI endpoints
- Missing data retention policies

Rule IDs: Use format CATEGORY-NNN (e.g., SEC-001, SQL-003, AUTH-002, HIPAA-001, etc.)

Be thorough but avoid false positives. Only report real issues with specific line numbers and code snippets when possible.`
  }

  buildPrompt(input: JavaCodeAnalyzerInput): string {
    return `Analyze this ${input.language} source file for issues.

<file_name>${input.fileName}</file_name>
<analysis_types>${input.analysisTypes.join(', ')}</analysis_types>

<source_code>
${input.fileContent}
</source_code>

Return: { "issues": [...] }
Only include issues for the requested analysis types. Be specific about line numbers and code snippets.`
  }
}
