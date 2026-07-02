import { pgTable, uuid, text, varchar, integer, timestamp } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ownerId:               text('owner_id').notNull(),
  organizationId:        uuid('organization_id'),
  name:                  varchar('name', { length: 255 }).notNull(),
  description:           text('description'),
  coverageThreshold:     integer('coverage_threshold').default(0),         // 0 = no gate
  githubInstallationId:  text('github_installation_id'),
  githubRepo:            text('github_repo'),                              // "owner/repo"
  bitbucketWorkspace:    text('bitbucket_workspace'),
  bitbucketRepo:         text('bitbucket_repo'),
  lastActivityAt:        timestamp('last_activity_at', { withTimezone: true }).defaultNow(),
  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
