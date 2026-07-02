import type { FastifyInstance } from 'fastify'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getDb, projects, auditLogs } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/audit-logs?limit=50&offset=0
  app.get('/api/v1/projects/:projectId/audit-logs', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { limit: limitStr, offset: offsetStr } = req.query as { limit?: string; offset?: string }
    const limit = Math.min(parseInt(limitStr ?? '50', 10), 100)
    const offset = parseInt(offsetStr ?? '0', 10)

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const logs = await db.select().from(auditLogs)
      .where(eq(auditLogs.projectId, projectId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs)
      .where(eq(auditLogs.projectId, projectId))

    reply.send({ success: true, data: { logs, total: countResult?.count ?? 0 } })
  })
}
