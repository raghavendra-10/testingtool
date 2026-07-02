import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const apiKeys = pgTable('api_keys', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ownerId:     text('owner_id').notNull(),
  name:        varchar('name', { length: 255 }).notNull(),
  // SHA-256 hash of the key — never store plaintext
  keyHash:     varchar('key_hash', { length: 64 }).notNull().unique(),
  // First 8 chars for display: "sk_live_abc..."
  keyPrefix:   varchar('key_prefix', { length: 16 }).notNull(),
  lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
  revokedAt:   timestamp('revoked_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
