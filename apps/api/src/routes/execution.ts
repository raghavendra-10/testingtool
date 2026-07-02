import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, asc } from 'drizzle-orm'
import { Queue } from 'bullmq'
import { getDb, projects, executionRuns, executionSteps, endpoints, generatedTests } from '@speclyn/db'
import { getRedisConnection } from '@speclyn/shared-types'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { signRunStreamToken } from '../lib/run-stream-token.js'
import { createRedisClient } from '../lib/redis.js'
import { logAudit } from '../lib/audit.js'

const CreateRunBody = z.object({
  endpointIds: z.array(z.string().uuid()).min(1).optional(),
  baseUrl: z.string().url().optional(),
})

const CreateBrowserRunBody = z.object({
  pageUrls: z.array(z.string().url()).min(1).max(10),
  baseUrl: z.string().url().optional(),
})

function getGenerateQueue(): Queue {
  return new Queue('generate-tests', { connection: getRedisConnection() })
}

function getGenerateBrowserQueue(): Queue {
  return new Queue('generate-browser-tests', { connection: getRedisConnection() })
}

export async function executionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // POST /api/v1/projects/:projectId/runs — create run + kick off generation
  app.post('/api/v1/projects/:projectId/runs', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = CreateRunBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })
    }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    // Use all endpoints if none specified
    let endpointIds = parsed.data.endpointIds
    if (!endpointIds || endpointIds.length === 0) {
      const eps = await db.select({ id: endpoints.id }).from(endpoints)
        .where(eq(endpoints.projectId, projectId))
      endpointIds = eps.map(e => e.id)
    }

    if (endpointIds.length === 0) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No endpoints found. Upload an OpenAPI spec first.' } })
    }

    const baseUrl = parsed.data.baseUrl ?? 'http://localhost:3000'

    const [run] = await db.insert(executionRuns).values({
      projectId,
      status: 'pending',
    }).returning()
    if (!run) return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR' } })

    await getGenerateQueue().add('generate', {
      projectId,
      runId: run.id,
      endpointIds,
      ownerId: userId,
      baseUrl,
    } satisfies import('@speclyn/shared-types').GenerateTestsJobPayload, { attempts: 1 })

    void logAudit({ userId, projectId, action: 'create_run', resourceType: 'run', resourceId: run.id, metadata: { baseUrl, endpointCount: endpointIds.length } })
    reply.code(201).send({ success: true, data: run })
  })

  // GET /api/v1/projects/:projectId/runs
  app.get('/api/v1/projects/:projectId/runs', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const runs = await db.select().from(executionRuns)
      .where(eq(executionRuns.projectId, projectId))
      .orderBy(desc(executionRuns.createdAt))

    reply.send({ success: true, data: runs })
  })

  // GET /api/v1/projects/:projectId/runs/:runId
  app.get('/api/v1/projects/:projectId/runs/:runId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, runId } = req.params as { projectId: string; runId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [run] = await db.select().from(executionRuns).where(eq(executionRuns.id, runId))
    if (!run) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const steps = await db
      .select({
        id: executionSteps.id,
        runId: executionSteps.runId,
        testId: executionSteps.testId,
        testName: generatedTests.name,
        status: executionSteps.status,
        errorType: executionSteps.errorType,
        errorMessage: executionSteps.errorMessage,
        durationMs: executionSteps.durationMs,
        startedAt: executionSteps.startedAt,
        completedAt: executionSteps.completedAt,
        createdAt: executionSteps.createdAt,
      })
      .from(executionSteps)
      .innerJoin(generatedTests, eq(executionSteps.testId, generatedTests.id))
      .where(eq(executionSteps.runId, runId))
      .orderBy(asc(executionSteps.createdAt))

    reply.send({ success: true, data: { ...run, steps } })
  })

  // POST /api/v1/projects/:projectId/browser-runs — create a browser test run
  app.post('/api/v1/projects/:projectId/browser-runs', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = CreateBrowserRunBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })
    }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const baseUrl = parsed.data.baseUrl ?? 'http://localhost:3000'

    const [run] = await db.insert(executionRuns).values({
      projectId,
      status: 'pending',
    }).returning()
    if (!run) return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR' } })

    await getGenerateBrowserQueue().add('generate', {
      projectId,
      runId: run.id,
      pageUrls: parsed.data.pageUrls,
      ownerId: userId,
      baseUrl,
    }, { attempts: 1 })

    reply.code(201).send({ success: true, data: run })
  })

  // POST /api/v1/projects/:projectId/runs/:runId/cancel — cancel a running execution
  app.post('/api/v1/projects/:projectId/runs/:runId/cancel', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, runId } = req.params as { projectId: string; runId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [run] = await db.select().from(executionRuns).where(eq(executionRuns.id, runId))
    if (!run) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    if (['passed', 'failed', 'error', 'cancelled'].includes(run.status)) {
      return reply.code(400).send({ success: false, error: { code: 'ALREADY_TERMINAL', message: `Run already ${run.status}` } })
    }

    // Mark as cancelled in DB
    await db.update(executionRuns)
      .set({ status: 'cancelled', failureReason: 'Cancelled by user', completedAt: new Date() })
      .where(eq(executionRuns.id, runId))

    // Notify SSE subscribers
    const pub = createRedisClient()
    await pub.publish(
      `project:${projectId}:run:${runId}`,
      JSON.stringify({ type: 'run_status', status: 'cancelled' }),
    )
    pub.disconnect()

    reply.send({ success: true, data: { id: runId, status: 'cancelled' } })
  })

  // POST /api/v1/projects/:projectId/runs/:runId/stream-token — run-level SSE token
  app.post('/api/v1/projects/:projectId/runs/:runId/stream-token', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, runId } = req.params as { projectId: string; runId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const expiresAt = Date.now() + 30 * 60_000 // 30 minutes
    const token = signRunStreamToken({ userId, projectId, runId, expiresAt })
    reply.send({ success: true, data: { token, expiresAt: new Date(expiresAt).toISOString() } })
  })
}
