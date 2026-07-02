import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const outboundWebhooks = pgTable('outbound_webhooks', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  url:       text('url').notNull(),
  secret:    text('secret'),    // HMAC-SHA256 secret for signing payloads
  events:    text('events').notNull(), // comma-separated: run_completed,defect_created,coverage_changed
  enabled:   boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
