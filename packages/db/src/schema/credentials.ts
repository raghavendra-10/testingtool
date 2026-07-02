import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { environments } from './environments'

export const credentialReferences = pgTable('credential_references', {
  id:               uuid('id').primaryKey().defaultRandom(),
  projectId:        uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  environmentId:    uuid('environment_id').references(() => environments.id, { onDelete: 'set null' }),
  name:             varchar('name', { length: 255 }).notNull(),
  // bearer | api_key | basic_auth | oauth2 | custom_header
  type:             varchar('type', { length: 50 }).notNull(),
  // AES-256-GCM ciphertext: "iv:authTag:ciphertext" hex-encoded
  encryptedValue:   text('encrypted_value').notNull(),
  // B-14: only for bearer/api_key — null for passwords and oauth
  encryptedPreview: varchar('encrypted_preview', { length: 10 }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
