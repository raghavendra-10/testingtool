import type { FastifyInstance } from 'fastify'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getDb, projects, defects } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { parsePagination, paginatedResponse } from '../lib/pagination.js'

export async function defectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects/:projectId/defects', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>)

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(defects)
      .where(eq(defects.projectId, projectId))

    const rows = await db.select().from(defects)
      .where(eq(defects.projectId, projectId))
      .orderBy(desc(defects.createdAt))
      .limit(limit)
      .offset(offset)

    reply.send(paginatedResponse(rows, countResult?.count ?? 0, limit, offset))
  })
}
