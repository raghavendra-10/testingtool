import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface SchemaAnalyzerInput {
  projectId: string
  schemaContent: string
  analysisTypes: string[]
}

const SchemaIssueSchema = z.object({
  category: z.enum([
    'table_structure', 'column_type', 'missing_constraint', 'missing_index',
    'missing_fk', 'missing_pk', 'redundant_column', 'naming_convention',
    'cascade_rule', 'soft_delete', 'data_validation', 'referential_integrity',
    'multi_tenant_isolation', 'hipaa_field',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  tableName: z.string().nullable(),
  columnName: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  sqlSnippet: z.string().nullable(),
  ruleId: z.string(),
})

const SchemaAnalyzerSchema = z.object({
  tables: z.array(z.object({
    name: z.string(),
    columnCount: z.number(),
    hasPrimaryKey: z.boolean(),
    foreignKeys: z.number(),
    indexes: z.number(),
  })),
  issues: z.array(SchemaIssueSchema),
})

export type SchemaAnalyzerOutput = z.infer<typeof SchemaAnalyzerSchema>

export class SchemaAnalyzerAgent extends BaseAgent<SchemaAnalyzerInput, SchemaAnalyzerOutput> {
  readonly name = 'schema-analyzer-agent'
  readonly outputSchema = SchemaAnalyzerSchema

  constructor() {
    super()
    this.maxTokens = 16384
  }

  getSystemPrompt(): string {
    return `You are an expert database schema analyzer for Speclyn. You analyze SQL schema definitions (CREATE TABLE, ALTER TABLE, CREATE INDEX statements) and find structural, performance, and security issues.

Return ONLY valid JSON. No markdown.

Categories you must check (based on analysisTypes requested):

**table_structure** — Check for:
- Missing primary keys
- Tables with too many columns (>30)
- Missing created_at / updated_at audit columns
- Redundant or duplicate tables
- Poor table naming (singular vs plural inconsistency, non-descriptive names)

**column_type** — Check for:
- Wrong data types (VARCHAR for dates, INT for booleans, TEXT for short fixed strings)
- Missing NOT NULL on required fields
- Missing DEFAULT values where appropriate
- VARCHAR lengths too large or too small
- Using FLOAT/DOUBLE for monetary values (should be DECIMAL)

**missing_constraint** — Check for:
- Missing UNIQUE constraints on natural keys (email, username, SSN)
- Missing CHECK constraints on status/enum columns
- Missing NOT NULL on foreign key columns

**missing_index** — Check for:
- Foreign key columns without indexes
- Columns used in WHERE/JOIN without indexes
- Composite indexes needed for common query patterns
- Missing indexes on frequently filtered columns (status, created_at, tenant_id)

**missing_fk** — Check for:
- Reference columns without FOREIGN KEY constraints
- Columns named *_id without corresponding FK
- Missing ON DELETE / ON UPDATE rules

**missing_pk** — Check for:
- Tables without primary keys
- Composite PKs that should use a surrogate key
- Using business keys as PK (email, SSN) instead of synthetic ID

**redundant_column** — Check for:
- Duplicate data stored in multiple tables
- Computed columns that can be derived
- Denormalized data without justification

**naming_convention** — Check for:
- Inconsistent naming (camelCase vs snake_case)
- Reserved word usage as column/table names
- Non-descriptive column names (val, data, info, type)
- Inconsistent prefix/suffix patterns

**cascade_rule** — Check for:
- Missing ON DELETE rules on foreign keys
- CASCADE on sensitive data (should be RESTRICT)
- SET NULL on NOT NULL columns
- Orphan records possible due to missing cascades

**soft_delete** — Check for:
- Tables with deleted_at/is_deleted without proper indexes
- Missing filtered indexes for soft delete
- Inconsistent soft delete implementation across tables

**data_validation** — Check for:
- Missing CHECK constraints on amounts (must be >= 0)
- Missing date range validations
- Missing status enum constraints
- Missing length constraints on sensitive fields

**referential_integrity** — Check for:
- Circular references
- Missing junction tables for M:N relationships
- Orphan-prone relationships
- Self-referencing FK without proper handling

**multi_tenant_isolation** — Check for:
- Tables missing tenant_id / organization_id / clinic_id column
- Missing composite indexes including tenant column
- Missing row-level security policies
- Cross-tenant joins possible

**hipaa_field** — Check for:
- PHI fields (SSN, DOB, diagnosis, insurance_id) not marked for encryption
- PHI columns without audit columns
- Missing access control columns for PHI tables
- PHI stored in plain text columns

Rule IDs: Use format SCHEMA-NNN, IDX-NNN, FK-NNN, TENANT-NNN, HIPAA-NNN, etc.

First list all tables found with their structure summary, then list all issues.`
  }

  buildPrompt(input: SchemaAnalyzerInput): string {
    return `Analyze this SQL schema for issues.

<analysis_types>${input.analysisTypes.join(', ')}</analysis_types>

<schema>
${input.schemaContent}
</schema>

Return: { "tables": [...], "issues": [...] }
Only include issues for the requested analysis types. Be specific about table and column names.`
  }
}
