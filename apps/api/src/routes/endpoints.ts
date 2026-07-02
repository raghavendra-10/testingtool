import type { FastifyInstance } from 'fastify'
import { eq, and, sql } from 'drizzle-orm'
import { getDb, projects, endpoints } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { parsePagination, paginatedResponse } from '../lib/pagination.js'

export async function endpointRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects/:projectId/endpoints', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>)

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(endpoints)
      .where(eq(endpoints.projectId, projectId))

    const rows = await db.select().from(endpoints)
      .where(eq(endpoints.projectId, projectId))
      .limit(limit)
      .offset(offset)

    reply.send(paginatedResponse(rows, countResult?.count ?? 0, limit, offset))
  })
}
