import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
import { Queue } from 'bullmq'
import {
  getDb, projects, codeAnalysisRuns, codeIssues,
  schemaAnalysisRuns, schemaIssues,
} from '@speclyn/db'
import { getRedisConnection } from '@speclyn/shared-types'
import type { CodeAnalysisJobPayload, SchemaAnalysisJobPayload } from '@speclyn/shared-types'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { logAudit } from '../lib/audit.js'
import { parsePagination, paginatedResponse } from '../lib/pagination.js'

const TriggerCodeAnalysisBody = z.object({
  language: z.enum(['java', 'python', 'csharp', 'go', 'kotlin', 'typescript', 'javascript']).default('java'),
  analysisTypes: z.array(z.string()).min(1).default([
    'code_structure', 'api_pattern', 'auth_security', 'sql_security',
    'hardcoded_secret', 'input_validation', 'error_handling', 'logging',
    'deprecated_usage', 'naming_convention', 'transaction_handling',
    'data_exposure', 'encryption', 'multi_tenant', 'hipaa',
  ]),
})

const TriggerSchemaAnalysisBody = z.object({
  schemaContent: z.string().min(10).max(100000),
  analysisTypes: z.array(z.string()).min(1).default([
    'table_structure', 'constraints', 'indexes', 'naming',
    'multi_tenant', 'hipaa',
  ]),
})

function getCodeAnalysisQueue(): Queue {
  return new Queue('analyze-code', { connection: getRedisConnection() })
}

function getSchemaAnalysisQueue(): Queue {
  return new Queue('analyze-schema', { connection: getRedisConnection() })
}

export async function codeAnalysisRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // ─── Code Analysis ──────────────────────────────────────────────

  // POST /api/v1/projects/:projectId/code-analysis — trigger code analysis
  app.post('/api/v1/projects/:projectId/code-analysis', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = TriggerCodeAnalysisBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })
    }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [run] = await db.insert(codeAnalysisRuns).values({
      projectId,
      status: 'pending',
      language: parsed.data.language,
    }).returning()
    if (!run) return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR' } })

    await getCodeAnalysisQueue().add('analyze', {
      projectId,
      runId: run.id,
      ownerId: userId,
      language: parsed.data.language,
      analysisTypes: parsed.data.analysisTypes,
    } satisfies CodeAnalysisJobPayload, { attempts: 1 })

    void logAudit({
      userId, projectId, action: 'trigger_code_analysis',
      resourceType: 'code_analysis_run', resourceId: run.id,
      metadata: { language: parsed.data.language },
    })

    reply.code(201).send({ success: true, data: run })
  })

  // GET /api/v1/projects/:projectId/code-analysis — list code analysis runs
  app.get('/api/v1/projects/:projectId/code-analysis', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>)

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(codeAnalysisRuns)
      .where(eq(codeAnalysisRuns.projectId, projectId))

    const runs = await db.select().from(codeAnalysisRuns)
      .where(eq(codeAnalysisRuns.projectId, projectId))
      .orderBy(desc(codeAnalysisRuns.createdAt))
      .limit(limit)
      .offset(offset)

    reply.send(paginatedResponse(runs, countResult?.count ?? 0, limit, offset))
  })

  // GET /api/v1/projects/:projectId/code-analysis/:runId — get run with issues
  app.get('/api/v1/projects/:projectId/code-analysis/:runId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, runId } = req.params as { projectId: string; runId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [run] = await db.select().from(codeAnalysisRuns)
      .where(eq(codeAnalysisRuns.id, runId))
    if (!run) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const issues = await db.select().from(codeIssues)
      .where(eq(codeIssues.runId, runId))

    reply.send({ success: true, data: { ...run, issues } })
  })

  // ─── Schema Analysis ──────────────────────────────────────────────

  // POST /api/v1/projects/:projectId/schema-analysis — trigger schema analysis
  app.post('/api/v1/projects/:projectId/schema-analysis', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = TriggerSchemaAnalysisBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })
    }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [run] = await db.insert(schemaAnalysisRuns).values({
      projectId,
      status: 'pending',
      sourceType: 'upload',
      schemaSnapshot: parsed.data.schemaContent.slice(0, 50000),
    }).returning()
    if (!run) return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR' } })

    await getSchemaAnalysisQueue().add('analyze', {
      projectId,
      runId: run.id,
      ownerId: userId,
      schemaContent: parsed.data.schemaContent,
      analysisTypes: parsed.data.analysisTypes,
    } satisfies SchemaAnalysisJobPayload, { attempts: 1 })

    void logAudit({
      userId, projectId, action: 'trigger_schema_analysis',
      resourceType: 'schema_analysis_run', resourceId: run.id,
    })

    reply.code(201).send({ success: true, data: run })
  })

  // GET /api/v1/projects/:projectId/schema-analysis — list schema analysis runs
  app.get('/api/v1/projects/:projectId/schema-analysis', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>)

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(schemaAnalysisRuns)
      .where(eq(schemaAnalysisRuns.projectId, projectId))

    const runs = await db.select().from(schemaAnalysisRuns)
      .where(eq(schemaAnalysisRuns.projectId, projectId))
      .orderBy(desc(schemaAnalysisRuns.createdAt))
      .limit(limit)
      .offset(offset)

    reply.send(paginatedResponse(runs, countResult?.count ?? 0, limit, offset))
  })

  // GET /api/v1/projects/:projectId/schema-analysis/:runId — get run with issues
  app.get('/api/v1/projects/:projectId/schema-analysis/:runId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, runId } = req.params as { projectId: string; runId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [run] = await db.select().from(schemaAnalysisRuns)
      .where(eq(schemaAnalysisRuns.id, runId))
    if (!run) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const issues = await db.select().from(schemaIssues)
      .where(eq(schemaIssues.runId, runId))

    reply.send({ success: true, data: { ...run, issues } })
  })
}
