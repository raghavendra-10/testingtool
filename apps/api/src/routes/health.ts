import type { FastifyInstance } from 'fastify'
import { getDb } from '@speclyn/db'
import { sql } from 'drizzle-orm'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    try {
      await getDb().execute(sql`SELECT 1`)
      reply.send({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } })
    } catch {
      reply.code(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unreachable' } })
    }
  })
}
