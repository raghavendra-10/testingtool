import { pgTable, uuid, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { environments } from './environments'

export const schedules = pgTable('schedules', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  environmentId:   uuid('environment_id').references(() => environments.id, { onDelete: 'set null' }),
  name:            varchar('name', { length: 255 }).notNull(),
  cronExpression:  varchar('cron_expression', { length: 100 }).notNull(), // e.g. "0 */6 * * *"
  intervalHours:   integer('interval_hours').notNull(),                    // human-readable: every N hours
  enabled:         boolean('enabled').default(true).notNull(),
  lastRunAt:       timestamp('last_run_at', { withTimezone: true }),
  nextRunAt:       timestamp('next_run_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
