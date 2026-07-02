import { pgTable, uuid, varchar, text, integer, real, timestamp, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const agentDecisionLogs = pgTable('agent_decision_logs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  agentType:       varchar('agent_type', { length: 100 }).notNull(),
  modelUsed:       varchar('model_used', { length: 100 }).notNull(),
  inputSummary:    text('input_summary'),
  outputSummary:   text('output_summary'),
  tokensInput:     integer('tokens_input'),
  tokensOutput:    integer('tokens_output'),
  latencyMs:       integer('latency_ms'),
  confidenceScore: real('confidence_score'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // C-2: required for budget query performance
  index('idx_agent_logs_project_date').on(table.projectId, table.createdAt),
])
