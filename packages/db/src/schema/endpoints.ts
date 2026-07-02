import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const endpoints = pgTable('endpoints', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  method:      varchar('method', { length: 10 }).notNull(),  // GET POST PUT PATCH DELETE
  path:        text('path').notNull(),
  summary:     text('summary'),
  source:      varchar('source', { length: 20 }).notNull(),  // openapi | postman | ast
  requestBody: text('request_body'),   // JSON schema string
  responses:   text('responses'),      // JSON schema string
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_endpoint_project_method_path').on(table.projectId, table.method, table.path),
])
