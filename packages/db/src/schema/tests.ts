import { pgTable, uuid, varchar, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const generatedTests = pgTable('generated_tests', {
  id:            uuid('id').primaryKey().defaultRandom(),
  projectId:     uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:          text('name').notNull(),
  testType:      varchar('test_type', { length: 20 }).notNull(),     // api | browser
  // B-11: read_only | creates_data | destructive
  dataLifecycle: varchar('data_lifecycle', { length: 20 }).notNull().default('read_only'),
  // active | draft (compile failed or no assertions)
  status:        varchar('status', { length: 20 }).notNull().default('draft'),
  storageUrl:    text('storage_url'),    // S3 path to .test.ts file
  codeSnapshot:  text('code_snapshot'),  // latest code (for display without S3 roundtrip)
  compileError:  text('compile_error'),
  endpointId:    uuid('endpoint_id'),
  qualityScore:  integer('quality_score'),       // 1-5 AI quality rating
  qualityNotes:  text('quality_notes'),          // AI reasoning + suggestions
  isEdited:      boolean('is_edited').default(false).notNull(), // user edited = locked from regeneration
  suiteId:       uuid('suite_id'),               // optional test suite grouping
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_generated_tests_project').on(table.projectId),
  index('idx_generated_tests_project_status').on(table.projectId, table.status),
])

export const testSuites = pgTable('test_suites', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  runOrder:    varchar('run_order', { length: 20 }).default('parallel').notNull(), // parallel | serial
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const coverageLinks = pgTable('coverage_links', {
  id:            uuid('id').primaryKey().defaultRandom(),
  requirementId: uuid('requirement_id').notNull(),
  testId:        uuid('test_id').notNull().references(() => generatedTests.id, { onDelete: 'cascade' }),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_coverage_links_requirement').on(table.requirementId),
  index('idx_coverage_links_test').on(table.testId),
])
