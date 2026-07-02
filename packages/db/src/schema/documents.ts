import { pgTable, uuid, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const sourceDocuments = pgTable('source_documents', {
  id:               uuid('id').primaryKey().defaultRandom(),
  projectId:        uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filename:         varchar('filename', { length: 500 }).notNull(),
  mimeType:         varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes:        integer('size_bytes').notNull().default(0),
  s3Key:            text('s3_key').notNull(),
  status:           varchar('status', { length: 20 }).notNull().default('pending'),
  // pending | processing | done | error
  requirementCount: integer('requirement_count').default(0),
  errorMessage:     text('error_message'),
  processedAt:      timestamp('processed_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
