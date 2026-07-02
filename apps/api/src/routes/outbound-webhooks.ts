import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, outboundWebhooks } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function outboundWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects/:projectId/webhooks', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const db = getDb()

    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const hooks = await db.select({
      id: outboundWebhooks.id, url: outboundWebhooks.url,
      events: outboundWebhooks.events, enabled: outboundWebhooks.enabled,
      createdAt: outboundWebhooks.createdAt,
    }).from(outboundWebhooks).where(eq(outboundWebhooks.projectId, projectId))

    reply.send({ success: true, data: hooks })
  })

  app.post('/api/v1/projects/:projectId/webhooks', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      url: z.string().url(),
      events: z.string().min(1),
      secret: z.string().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } })

    const db = getDb()
    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [hook] = await db.insert(outboundWebhooks).values({
      projectId, url: body.data.url, events: body.data.events,
      secret: body.data.secret ?? null,
    }).returning()

    reply.code(201).send({ success: true, data: hook })
  })

  app.delete('/api/v1/projects/:projectId/webhooks/:hookId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, hookId } = req.params as { projectId: string; hookId: string }
    const db = getDb()

    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.delete(outboundWebhooks).where(eq(outboundWebhooks.id, hookId))
    reply.code(204).send()
  })
}
