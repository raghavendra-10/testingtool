import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, evidence, executionSteps } from '@speclyn/db'
import { getDownloadUrl } from '../lib/s3.js'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/evidence/:stepId
  app.get('/api/v1/projects/:projectId/evidence/:stepId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, stepId } = req.params as { projectId: string; stepId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const items = await db.select().from(evidence)
      .where(eq(evidence.stepId, stepId))

    // Generate presigned download URLs
    const withUrls = await Promise.all(items.map(async (item) => ({
      ...item,
      downloadUrl: await getDownloadUrl(item.storageUrl),
    })))

    reply.send({ success: true, data: withUrls })
  })
}
