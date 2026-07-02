import { pgTable, uuid, varchar, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const repoFileIndex = pgTable('repo_file_index', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filePath:        text('file_path').notNull(),
  blobSha:         varchar('blob_sha', { length: 40 }).notNull(),
  category:        varchar('category', { length: 30 }).notNull(),
  // route_candidate | model | middleware | config | test | migration | other
  language:        varchar('language', { length: 30 }),
  symbols:         text('symbols'),              // JSON array of exported symbols
  lineCount:       integer('line_count'),
  lastAnalyzedSha: varchar('last_analyzed_sha', { length: 40 }),
  summary:         text('summary'),              // 1-2 sentence LLM summary (Phase 5 RAG)
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_repo_file_project_path').on(table.projectId, table.filePath),
  index('idx_repo_file_project_category').on(table.projectId, table.category),
])

export const repoServices = pgTable('repo_services', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  serviceName: varchar('service_name', { length: 255 }).notNull(),
  rootPath:    text('root_path').notNull(),
  framework:   varchar('framework', { length: 50 }),
  language:    varchar('language', { length: 30 }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_repo_service_project_path').on(table.projectId, table.rootPath),
])
