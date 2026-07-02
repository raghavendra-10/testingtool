import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { getDb, projects } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { logAudit } from '../lib/audit.js'

const CreateProjectBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
})

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const db = getDb()
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.lastActivityAt))
    reply.send({ success: true, data: rows })
  })

  app.post('/api/v1/projects', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const parsed = CreateProjectBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })
    }
    const db = getDb()
    const [row] = await db
      .insert(projects)
      .values({ ownerId: userId, name: parsed.data.name, description: parsed.data.description })
      .returning()
    void logAudit({ userId, action: 'create_project', resourceType: 'project', resourceId: row?.id ?? null, metadata: { name: parsed.data.name } })
    reply.code(201).send({ success: true, data: row })
  })

  app.get('/api/v1/projects/:id', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { id } = req.params as { id: string }
    const db = getDb()
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })
    reply.send({ success: true, data: row })
  })

  app.patch('/api/v1/projects/:id', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { id } = req.params as { id: string }
    const parsed = CreateProjectBody.partial().safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })
    }
    const db = getDb()
    const [row] = await db
      .update(projects)
      .set({ ...parsed.data, lastActivityAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
      .returning()
    if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })
    reply.send({ success: true, data: row })
  })

  app.delete('/api/v1/projects/:id', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { id } = req.params as { id: string }
    const db = getDb()
    const [row] = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
      .returning()
    if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })
    void logAudit({ userId, action: 'delete_project', resourceType: 'project', resourceId: id, metadata: { name: row.name } })
    reply.code(204).send()
  })
}
