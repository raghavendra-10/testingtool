import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, generatedTests } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function testRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/tests — list all tests
  app.get('/api/v1/projects/:projectId/tests', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const tests = await db.select({
      id: generatedTests.id,
      name: generatedTests.name,
      testType: generatedTests.testType,
      dataLifecycle: generatedTests.dataLifecycle,
      status: generatedTests.status,
      endpointId: generatedTests.endpointId,
      qualityScore: generatedTests.qualityScore,
      compileError: generatedTests.compileError,
      isEdited: generatedTests.isEdited,
      createdAt: generatedTests.createdAt,
    }).from(generatedTests)
      .where(eq(generatedTests.projectId, projectId))

    reply.send({ success: true, data: tests })
  })

  // GET /api/v1/projects/:projectId/tests/:testId — get test with code
  app.get('/api/v1/projects/:projectId/tests/:testId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, testId } = req.params as { projectId: string; testId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [test] = await db.select().from(generatedTests)
      .where(and(eq(generatedTests.id, testId), eq(generatedTests.projectId, projectId)))
    if (!test) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    reply.send({ success: true, data: test })
  })

  // PATCH /api/v1/projects/:projectId/tests/:testId — update test code
  app.patch('/api/v1/projects/:projectId/tests/:testId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, testId } = req.params as { projectId: string; testId: string }
    const body = z.object({
      codeSnapshot: z.string().min(1),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.update(generatedTests)
      .set({
        codeSnapshot: body.data.codeSnapshot,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(and(eq(generatedTests.id, testId), eq(generatedTests.projectId, projectId)))

    reply.send({ success: true, data: { updated: true } })
  })
}
