import { pgTable, uuid, text, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const auditLogs = pgTable('audit_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id'),
  userId:      text('user_id').notNull(),
  action:      varchar('action', { length: 50 }).notNull(),
  // create_project | delete_project | upload_document | create_run | create_credential | revoke_api_key | etc.
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId:   text('resource_id'),
  metadata:     jsonb('metadata'), // additional context
  ipAddress:    varchar('ip_address', { length: 45 }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
