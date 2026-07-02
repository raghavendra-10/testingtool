import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { getDb, specTemplates } from '@speclyn/db'

// Public endpoints — no auth required
export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/templates', async (_req, reply) => {
    const db = getDb()
    const templates = await db.select({
      id: specTemplates.id,
      name: specTemplates.name,
      category: specTemplates.category,
      description: specTemplates.description,
      createdAt: specTemplates.createdAt,
    }).from(specTemplates).where(eq(specTemplates.isPublic, true))
    reply.send({ success: true, data: templates })
  })

  app.get('/api/v1/templates/:templateId', async (req, reply) => {
    const { templateId } = req.params as { templateId: string }
    const db = getDb()
    const [template] = await db.select().from(specTemplates)
      .where(eq(specTemplates.id, templateId))
    if (!template) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })
    reply.send({ success: true, data: template })
  })
}
