import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const codeAnalysisRuns = pgTable('code_analysis_runs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  projectId:     uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status:        varchar('status', { length: 20 }).notNull().default('pending'),
  // pending | analyzing | completed | error
  language:      varchar('language', { length: 30 }).notNull().default('java'),
  totalFiles:    integer('total_files').notNull().default(0),
  totalIssues:   integer('total_issues').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  highCount:     integer('high_count').notNull().default(0),
  mediumCount:   integer('medium_count').notNull().default(0),
  lowCount:      integer('low_count').notNull().default(0),
  failureReason: text('failure_reason'),
  startedAt:     timestamp('started_at', { withTimezone: true }),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const codeIssues = pgTable('code_issues', {
  id:             uuid('id').primaryKey().defaultRandom(),
  runId:          uuid('run_id').notNull().references(() => codeAnalysisRuns.id, { onDelete: 'cascade' }),
  projectId:      uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  category:       varchar('category', { length: 50 }).notNull(),
  // code_structure | api_pattern | auth_security | sql_security | hardcoded_secret |
  // input_validation | error_handling | logging | deprecated_usage | naming_convention |
  // transaction_handling | data_exposure | encryption | multi_tenant | hipaa
  severity:       varchar('severity', { length: 10 }).notNull(),   // critical | high | medium | low
  title:          text('title').notNull(),
  description:    text('description').notNull(),
  filePath:       text('file_path'),
  lineNumber:     integer('line_number'),
  codeSnippet:    text('code_snippet'),
  recommendation: text('recommendation').notNull(),
  ruleId:         varchar('rule_id', { length: 80 }),              // e.g. SEC-001, SQL-003
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_code_issues_run').on(table.runId),
  index('idx_code_issues_project').on(table.projectId),
  index('idx_code_issues_project_severity').on(table.projectId, table.severity),
])

export const schemaAnalysisRuns = pgTable('schema_analysis_runs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  projectId:     uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status:        varchar('status', { length: 20 }).notNull().default('pending'),
  sourceType:    varchar('source_type', { length: 20 }).notNull().default('upload'),
  // upload | repo  — whether SQL was uploaded or pulled from migrations in repo
  totalTables:   integer('total_tables').notNull().default(0),
  totalIssues:   integer('total_issues').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  highCount:     integer('high_count').notNull().default(0),
  mediumCount:   integer('medium_count').notNull().default(0),
  lowCount:      integer('low_count').notNull().default(0),
  schemaSnapshot: text('schema_snapshot'),                         // raw SQL stored for reference
  failureReason: text('failure_reason'),
  startedAt:     timestamp('started_at', { withTimezone: true }),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const schemaIssues = pgTable('schema_issues', {
  id:             uuid('id').primaryKey().defaultRandom(),
  runId:          uuid('run_id').notNull().references(() => schemaAnalysisRuns.id, { onDelete: 'cascade' }),
  projectId:      uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  category:       varchar('category', { length: 50 }).notNull(),
  // table_structure | column_type | missing_constraint | missing_index | missing_fk |
  // missing_pk | redundant_column | naming_convention | cascade_rule | soft_delete |
  // data_validation | referential_integrity | multi_tenant_isolation | hipaa_field
  severity:       varchar('severity', { length: 10 }).notNull(),
  tableName:      varchar('table_name', { length: 255 }),
  columnName:     varchar('column_name', { length: 255 }),
  title:          text('title').notNull(),
  description:    text('description').notNull(),
  recommendation: text('recommendation').notNull(),
  sqlSnippet:     text('sql_snippet'),
  ruleId:         varchar('rule_id', { length: 80 }),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
