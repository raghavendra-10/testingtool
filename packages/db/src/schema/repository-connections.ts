import { pgTable, uuid, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const repositoryConnections = pgTable('repository_connections', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  projectId:             uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  platform:              varchar('platform', { length: 20 }).notNull(), // github | bitbucket | gitlab
  repoUrl:               text('repo_url').notNull(),
  branch:                varchar('branch', { length: 255 }).notNull().default('main'),
  encryptedToken:        text('encrypted_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),  // bitbucket only — used to refresh expired access tokens
  status:                varchar('status', { length: 20 }).notNull().default('pending'),
  lastAnalyzedAt:        timestamp('last_analyzed_at', { withTimezone: true }),
  endpointCount:         integer('endpoint_count').default(0),
  stackDetected:         text('stack_detected'),
  errorMessage:          text('error_message'),
  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
