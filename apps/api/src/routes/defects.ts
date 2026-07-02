import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { getDb, projects, defects } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function defectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects/:projectId/defects', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const rows = await db.select().from(defects)
      .where(eq(defects.projectId, projectId))
      .orderBy(desc(defects.createdAt))

    reply.send({ success: true, data: rows })
  })
}
