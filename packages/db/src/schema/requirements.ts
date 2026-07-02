import { pgTable, uuid, varchar, text, real, timestamp, uniqueIndex, customType } from 'drizzle-orm/pg-core'

// pgvector column type — stores float[] as vector(1024)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() { return 'vector(1024)' },
  toDriver(value: number[]) { return `[${value.join(',')}]` },
  fromDriver(value: string) {
    return value.replace(/[[\]]/g, '').split(',').map(Number)
  },
})
import { projects } from './projects'
import { sourceDocuments } from './documents'

export const requirements = pgTable('requirements', {
  id:               uuid('id').primaryKey().defaultRandom(),
  projectId:        uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sourceDocumentId: uuid('source_document_id').references(() => sourceDocuments.id),
  // AUDIT FIX B-4: external_id is MANDATORY — always a SHA-256 hash, never null
  externalId:       varchar('external_id', { length: 64 }).notNull(),
  title:            text('title').notNull(),
  description:      text('description'),
  // type replaces category — matches spec §6.3
  type:             varchar('type', { length: 50 }).default('functional'),
  // functional | non_functional | security | performance
  module:           varchar('module', { length: 255 }).default(''),
  priority:         varchar('priority', { length: 20 }).default('medium').notNull(),
  status:           varchar('status', { length: 20 }).default('active').notNull(),
  sourceSection:    text('source_section'),
  confidenceScore:  real('confidence_score').default(1.0),
  embedding:        vector('embedding'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_req_project_doc_ext').on(table.projectId, table.sourceDocumentId, table.externalId),
])

export const requirementDuplicates = pgTable('requirement_duplicates', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  requirementAId:  uuid('requirement_a_id').notNull().references(() => requirements.id, { onDelete: 'cascade' }),
  requirementBId:  uuid('requirement_b_id').notNull().references(() => requirements.id, { onDelete: 'cascade' }),
  similarity:      real('similarity').notNull(),
  isDuplicate:     varchar('is_duplicate', { length: 10 }).notNull(), // 'true' | 'false'
  explanation:     text('explanation'),
  suggestedAction: varchar('suggested_action', { length: 20 }).notNull(), // 'merge' | 'keep_both' | 'review'
  resolvedAt:      timestamp('resolved_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
