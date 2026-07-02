import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, testSuites, generatedTests } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function suiteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/suites
  app.get('/api/v1/projects/:projectId/suites', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const suites = await db.select().from(testSuites).where(eq(testSuites.projectId, projectId))
    reply.send({ success: true, data: suites })
  })

  // POST /api/v1/projects/:projectId/suites
  app.post('/api/v1/projects/:projectId/suites', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      runOrder: z.enum(['parallel', 'serial']).optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [suite] = await db.insert(testSuites).values({
      projectId, name: body.data.name, description: body.data.description ?? null,
      runOrder: body.data.runOrder ?? 'parallel',
    }).returning()

    reply.code(201).send({ success: true, data: suite })
  })

  // PATCH /api/v1/projects/:projectId/suites/:suiteId/assign — assign tests to suite
  app.patch('/api/v1/projects/:projectId/suites/:suiteId/assign', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, suiteId } = req.params as { projectId: string; suiteId: string }
    const body = z.object({ testIds: z.array(z.string().uuid()) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    for (const testId of body.data.testIds) {
      await db.update(generatedTests).set({ suiteId }).where(eq(generatedTests.id, testId))
    }

    reply.send({ success: true, data: { assigned: body.data.testIds.length } })
  })

  // DELETE /api/v1/projects/:projectId/suites/:suiteId
  app.delete('/api/v1/projects/:projectId/suites/:suiteId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, suiteId } = req.params as { projectId: string; suiteId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    // Unassign tests first
    await db.update(generatedTests).set({ suiteId: null }).where(eq(generatedTests.suiteId, suiteId))
    await db.delete(testSuites).where(eq(testSuites.id, suiteId))
    reply.code(204).send()
  })
}
