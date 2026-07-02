import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { Queue } from 'bullmq'
import { getDb, projects, repositoryConnections } from '@speclyn/db'
import { encryptCredential } from '@speclyn/vault'
import { getRedisConnection } from '@speclyn/shared-types'
import type { AnalyzeRepoJobPayload } from '@speclyn/shared-types'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

function getRepoQueue(): Queue {
  return new Queue('analyze-repo', { connection: getRedisConnection() })
}

export async function repositoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // POST /api/v1/projects/:projectId/repositories
  app.post('/api/v1/projects/:projectId/repositories', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      platform: z.enum(['github', 'bitbucket', 'gitlab']),
      repoUrl: z.string().min(5),
      branch: z.string().default('main'),
      accessToken: z.string().min(1),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const encrypted = encryptCredential(body.data.accessToken)
    const repoUrl = body.data.repoUrl.replace(/^git\s+clone\s+/i, '').trim()

    const [conn] = await db.insert(repositoryConnections).values({
      projectId,
      platform: body.data.platform,
      repoUrl,
      branch: body.data.branch,
      encryptedToken: encrypted,
      status: 'pending',
    }).returning()

    if (conn) {
      await getRepoQueue().add('analyze', {
        repositoryConnectionId: conn.id,
        projectId,
        cloneUrl: body.data.repoUrl,
        branch: body.data.branch,
        credentialId: conn.id,
        ownerId: userId,
      } satisfies AnalyzeRepoJobPayload, { attempts: 2 })
    }

    reply.code(201).send({ success: true, data: { id: conn?.id, platform: body.data.platform, repoUrl: body.data.repoUrl, branch: body.data.branch, status: 'pending' } })
  })

  // GET /api/v1/projects/:projectId/repositories
  app.get('/api/v1/projects/:projectId/repositories', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const repos = await db.select({
      id: repositoryConnections.id, platform: repositoryConnections.platform,
      repoUrl: repositoryConnections.repoUrl, branch: repositoryConnections.branch,
      status: repositoryConnections.status, lastAnalyzedAt: repositoryConnections.lastAnalyzedAt,
      endpointCount: repositoryConnections.endpointCount, stackDetected: repositoryConnections.stackDetected,
      errorMessage: repositoryConnections.errorMessage, createdAt: repositoryConnections.createdAt,
    }).from(repositoryConnections).where(eq(repositoryConnections.projectId, projectId))

    reply.send({ success: true, data: repos })
  })

  // POST /api/v1/projects/:projectId/repositories/:repoId/reanalyze
  app.post('/api/v1/projects/:projectId/repositories/:repoId/reanalyze', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, repoId } = req.params as { projectId: string; repoId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [conn] = await db.select().from(repositoryConnections).where(eq(repositoryConnections.id, repoId))
    if (!conn) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.update(repositoryConnections).set({ status: 'pending', errorMessage: null }).where(eq(repositoryConnections.id, repoId))

    await getRepoQueue().add('analyze', {
      repositoryConnectionId: conn.id,
      projectId,
      cloneUrl: conn.repoUrl,
      branch: conn.branch,
      credentialId: conn.id,
      ownerId: userId,
    } satisfies AnalyzeRepoJobPayload, { attempts: 2 })

    reply.send({ success: true, data: { status: 'pending' } })
  })

  // PATCH /api/v1/projects/:projectId/repositories/:repoId — update token, URL, branch
  app.patch('/api/v1/projects/:projectId/repositories/:repoId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, repoId } = req.params as { projectId: string; repoId: string }
    const body = z.object({
      accessToken: z.string().min(1).optional(),
      repoUrl: z.string().min(5).optional(),
      branch: z.string().min(1).optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const updates: Record<string, unknown> = { status: 'pending', errorMessage: null }
    if (body.data.accessToken) updates['encryptedToken'] = encryptCredential(body.data.accessToken)
    if (body.data.repoUrl) updates['repoUrl'] = body.data.repoUrl.replace(/^git\s+clone\s+/i, '').trim()
    if (body.data.branch) updates['branch'] = body.data.branch

    await db.update(repositoryConnections).set(updates).where(eq(repositoryConnections.id, repoId))

    // Re-enqueue analysis
    const [conn] = await db.select().from(repositoryConnections).where(eq(repositoryConnections.id, repoId))
    if (conn) {
      await getRepoQueue().add('analyze', {
        repositoryConnectionId: conn.id, projectId,
        cloneUrl: conn.repoUrl, branch: conn.branch,
        credentialId: conn.id, ownerId: userId,
      } satisfies AnalyzeRepoJobPayload, { attempts: 2 })
    }

    reply.send({ success: true, data: { status: 'pending' } })
  })

  // DELETE /api/v1/projects/:projectId/repositories/:repoId
  app.delete('/api/v1/projects/:projectId/repositories/:repoId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, repoId } = req.params as { projectId: string; repoId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.delete(repositoryConnections).where(eq(repositoryConnections.id, repoId))
    reply.code(204).send()
  })
}
