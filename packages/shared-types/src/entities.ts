import { z } from 'zod'

// ─── Project ──────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string(),  // Clerk user ID — text, not uuid
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  enabledModules: z.array(z.string()).default(['functional', 'regression', 'api', 'compliance', 'data']),
  lastActivityAt: z.date(),
  createdAt: z.date(),
})

export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

// ─── Source Document ──────────────────────────────────────────────────────────

export const ParseStatusSchema = z.enum(['pending', 'processing', 'done', 'failed'])
export type ParseStatus = z.infer<typeof ParseStatusSchema>

export const SourceDocumentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  fileName: z.string(),
  format: z.enum(['pdf', 'docx', 'markdown', 'openapi', 'postman']),
  storageUrl: z.string(),
  parseStatus: ParseStatusSchema,
  parseError: z.string().nullable(),
  parsedAt: z.date().nullable(),
  createdAt: z.date(),
})

export type SourceDocument = z.infer<typeof SourceDocumentSchema>

// ─── Requirement ─────────────────────────────────────────────────────────────

export const RequirementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceDocumentId: z.string().uuid().nullable(),
  externalId: z.string().max(64),  // SHA-256 hash — mandatory, never null
  type: z.string().nullable(),
  module: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  status: z.string().default('active'),
  sourceChunkRef: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1).default(1.0),
  createdAt: z.date(),
})

export type Requirement = z.infer<typeof RequirementSchema>

// ─── Credential ───────────────────────────────────────────────────────────────

export const CredentialTypeSchema = z.enum(['bearer', 'api_key', 'basic_auth', 'oauth2', 'custom_header'])
export type CredentialType = z.infer<typeof CredentialTypeSchema>

export const CredentialReferenceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  type: CredentialTypeSchema,
  encryptedPreview: z.string().nullable(),  // only bearer/api_key
  createdAt: z.date(),
})

export type CredentialReference = z.infer<typeof CredentialReferenceSchema>

// ─── Execution Run ────────────────────────────────────────────────────────────

export const RunStatusSchema = z.enum(['pending', 'running', 'passed', 'failed', 'cancelled'])
export type RunStatus = z.infer<typeof RunStatusSchema>

export const ExecutionRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().nullable(),
  status: RunStatusSchema,
  totalTests: z.number().int().default(0),
  passed: z.number().int().default(0),
  failed: z.number().int().default(0),
  skipped: z.number().int().default(0),
  coveragePercent: z.number().nullable(),
  failureReason: z.string().nullable(),
  lastHeartbeatAt: z.date().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
})

export type ExecutionRun = z.infer<typeof ExecutionRunSchema>

// ─── Coverage Status ──────────────────────────────────────────────────────────

export const CoverageStatusSchema = z.enum(['COVERED', 'PARTIAL', 'FAILING', 'NOT_TESTED', 'NOT_STARTED'])
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>

// ─── Step Event (SSE) ─────────────────────────────────────────────────────────

export const StepEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('step_started'), data: z.object({ stepId: z.string(), testName: z.string(), testType: z.string() }) }),
  z.object({ event: z.literal('step_completed'), data: z.object({ stepId: z.string(), status: z.enum(['passed', 'failed', 'skipped']), durationMs: z.number() }) }),
  z.object({ event: z.literal('step_failed'), data: z.object({ stepId: z.string(), errorType: z.string(), errorMessage: z.string() }) }),
  z.object({ event: z.literal('run_completed'), data: z.object({ runId: z.string(), passed: z.number(), failed: z.number(), coveragePercent: z.number().nullable() }) }),
  z.object({ event: z.literal('run_failed'), data: z.object({ runId: z.string(), reason: z.string() }) }),
])

export type StepEvent = z.infer<typeof StepEventSchema>
