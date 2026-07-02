import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, schedules } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects/:projectId/schedules', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const items = await db.select().from(schedules).where(eq(schedules.projectId, projectId))
    reply.send({ success: true, data: items })
  })

  app.post('/api/v1/projects/:projectId/schedules', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      name: z.string().min(1).max(255),
      intervalHours: z.number().int().min(1).max(720),
      environmentId: z.string().uuid().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const cronExpression = `0 */${body.data.intervalHours} * * *`
    const nextRunAt = new Date(Date.now() + body.data.intervalHours * 3600_000)

    const [schedule] = await db.insert(schedules).values({
      projectId,
      name: body.data.name,
      cronExpression,
      intervalHours: body.data.intervalHours,
      environmentId: body.data.environmentId ?? null,
      nextRunAt,
    }).returning()

    reply.code(201).send({ success: true, data: schedule })
  })

  app.patch('/api/v1/projects/:projectId/schedules/:scheduleId/toggle', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, scheduleId } = req.params as { projectId: string; scheduleId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId))
    if (!schedule) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.update(schedules)
      .set({ enabled: !schedule.enabled })
      .where(eq(schedules.id, scheduleId))

    reply.send({ success: true, data: { enabled: !schedule.enabled } })
  })

  app.delete('/api/v1/projects/:projectId/schedules/:scheduleId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, scheduleId } = req.params as { projectId: string; scheduleId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.delete(schedules).where(eq(schedules.id, scheduleId))
    reply.code(204).send()
  })
}
