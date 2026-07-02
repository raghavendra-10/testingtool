import type { FastifyInstance } from 'fastify'
import { eq, and, sql } from 'drizzle-orm'
import { getDb, projects, requirements, requirementDuplicates } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { embedText } from '@speclyn/agents'

export async function requirementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/requirements
  app.get('/api/v1/projects/:projectId/requirements', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const reqs = await db
      .select()
      .from(requirements)
      .where(eq(requirements.projectId, projectId))

    reply.send({ success: true, data: reqs })
  })

  // GET /api/v1/projects/:projectId/requirements/search?q=auth
  app.get('/api/v1/projects/:projectId/requirements/search', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { q } = req.query as { q?: string }

    if (!q || q.trim().length === 0) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Query parameter "q" is required' } })
    }

    const db = getDb()
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    // Embed the search query
    const queryVector = await embedText(q)
    const vectorStr = `[${queryVector.join(',')}]`

    // Cosine similarity search using pgvector
    const results = await db.execute(sql`
      SELECT id, title, description, type, module, priority, status, confidence_score,
             1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM requirements
      WHERE project_id = ${projectId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT 10
    `)

    reply.send({ success: true, data: results.rows })
  })

  // GET /api/v1/projects/:projectId/requirements/duplicates
  app.get('/api/v1/projects/:projectId/requirements/duplicates', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const dupes = await db.execute(sql`
      SELECT d.id, d.similarity, d.is_duplicate, d.explanation, d.suggested_action, d.resolved_at,
             a.id AS a_id, a.title AS a_title, a.description AS a_desc,
             b.id AS b_id, b.title AS b_title, b.description AS b_desc
      FROM requirement_duplicates d
      JOIN requirements a ON d.requirement_a_id = a.id
      JOIN requirements b ON d.requirement_b_id = b.id
      WHERE d.project_id = ${projectId} AND d.resolved_at IS NULL
      ORDER BY d.similarity DESC
    `)

    reply.send({ success: true, data: dupes.rows })
  })

  // POST /api/v1/projects/:projectId/requirements/duplicates/:id/resolve
  app.post('/api/v1/projects/:projectId/requirements/duplicates/:dupeId/resolve', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, dupeId } = req.params as { projectId: string; dupeId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.update(requirementDuplicates)
      .set({ resolvedAt: new Date() })
      .where(eq(requirementDuplicates.id, dupeId))

    reply.send({ success: true, data: { resolved: true } })
  })
}
