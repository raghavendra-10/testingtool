import { pgTable, uuid, text, varchar, timestamp } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id:          uuid('id').primaryKey().defaultRandom(),
  clerkOrgId:  text('clerk_org_id').notNull().unique(), // Clerk org ID
  name:        varchar('name', { length: 255 }).notNull(),
  slug:        varchar('slug', { length: 100 }).notNull().unique(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const orgMembers = pgTable('org_members', {
  id:             uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:         text('user_id').notNull(), // Clerk user ID
  role:           varchar('role', { length: 20 }).notNull().default('viewer'), // admin | tester | viewer
  invitedAt:      timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
  joinedAt:       timestamp('joined_at', { withTimezone: true }),
})
