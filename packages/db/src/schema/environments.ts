import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const environments = pgTable('environments', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 100 }).notNull(),
  baseUrl:     text('base_url').notNull(),
  isLoadSafe:  boolean('is_load_safe').default(false).notNull(),
  isDefault:   boolean('is_default').default(false).notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
