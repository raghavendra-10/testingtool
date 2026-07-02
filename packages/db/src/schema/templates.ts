import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'

export const specTemplates = pgTable('spec_templates', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name', { length: 255 }).notNull(),
  category:    varchar('category', { length: 50 }).notNull(), // auth | crud | payments | ecommerce
  description: text('description'),
  content:     text('content').notNull(),  // the spec template markdown/text
  isPublic:    boolean('is_public').default(true).notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
