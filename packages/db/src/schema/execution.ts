import { pgTable, uuid, varchar, text, integer, real, timestamp, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { generatedTests } from './tests'

export const executionRuns = pgTable('execution_runs', {
  id:               uuid('id').primaryKey().defaultRandom(),
  projectId:        uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  environmentId:    uuid('environment_id'),
  status:           varchar('status', { length: 20 }).notNull().default('pending'),
  totalTests:       integer('total_tests').notNull().default(0),
  passed:           integer('passed').notNull().default(0),
  failed:           integer('failed').notNull().default(0),
  skipped:          integer('skipped').notNull().default(0),
  coveragePercent:  real('coverage_percent'),
  failureReason:    text('failure_reason'),
  // B-10: inactivity-based orphan detection (not start-time-based)
  lastHeartbeatAt:  timestamp('last_heartbeat_at', { withTimezone: true }),
  startedAt:        timestamp('started_at', { withTimezone: true }),
  completedAt:      timestamp('completed_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_execution_runs_project').on(table.projectId),
  index('idx_execution_runs_status').on(table.projectId, table.status),
])

export const executionSteps = pgTable('execution_steps', {
  id:           uuid('id').primaryKey().defaultRandom(),
  runId:        uuid('run_id').notNull().references(() => executionRuns.id, { onDelete: 'cascade' }),
  testId:       uuid('test_id').notNull().references(() => generatedTests.id),
  status:       varchar('status', { length: 20 }).notNull(),  // passed | failed | skipped
  errorType:    varchar('error_type', { length: 50 }),
  errorMessage: text('error_message'),
  durationMs:   integer('duration_ms'),
  startedAt:    timestamp('started_at', { withTimezone: true }),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_execution_steps_run').on(table.runId),
  index('idx_execution_steps_run_status').on(table.runId, table.status),
])

export const evidence = pgTable('evidence', {
  id:          uuid('id').primaryKey().defaultRandom(),
  stepId:      uuid('step_id').notNull().references(() => executionSteps.id, { onDelete: 'cascade' }),
  type:        varchar('type', { length: 20 }).notNull(),  // screenshot | response | trace
  storageUrl:  text('storage_url').notNull(),
  mimeType:    varchar('mime_type', { length: 100 }),
  // Immutable — no delete within retention window
  capturedAt:  timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
})

export const defects = pgTable('defects', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  runId:           uuid('run_id').notNull().references(() => executionRuns.id, { onDelete: 'cascade' }),
  stepId:          uuid('step_id').references(() => executionSteps.id),
  requirementId:   uuid('requirement_id'),
  title:           text('title').notNull(),
  failureCategory: varchar('failure_category', { length: 50 }),
  errorMessage:    text('error_message'),
  aiClassification: text('ai_classification'),
  status:          varchar('status', { length: 20 }).notNull().default('open'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_defects_project').on(table.projectId),
  index('idx_defects_run').on(table.runId),
])
