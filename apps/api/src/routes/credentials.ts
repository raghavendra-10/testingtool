import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb, projects, credentialReferences, environments, apiKeys } from '@speclyn/db'
import { encryptCredential, buildPreview } from '@speclyn/vault'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { generateApiKey, hashApiKey } from '../middleware/api-key-auth.js'

const CreateCredentialBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['bearer', 'api_key', 'basic_auth', 'oauth2', 'custom_header']),
  value: z.string().min(1),
  environmentId: z.string().uuid().optional(),
})

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/credentials
  app.get('/api/v1/projects/:projectId/credentials', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const creds = await db.select({
      id: credentialReferences.id,
      name: credentialReferences.name,
      type: credentialReferences.type,
      preview: credentialReferences.encryptedPreview,
      environmentId: credentialReferences.environmentId,
      createdAt: credentialReferences.createdAt,
    }).from(credentialReferences)
      .where(eq(credentialReferences.projectId, projectId))

    reply.send({ success: true, data: creds })
  })

  // POST /api/v1/projects/:projectId/credentials
  app.post('/api/v1/projects/:projectId/credentials', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = CreateCredentialBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: parsed.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const encrypted = encryptCredential(parsed.data.value)
    const preview = buildPreview(parsed.data.type, parsed.data.value)

    const [cred] = await db.insert(credentialReferences).values({
      projectId,
      name: parsed.data.name,
      type: parsed.data.type,
      encryptedValue: encrypted,
      encryptedPreview: preview,
      environmentId: parsed.data.environmentId ?? null,
    }).returning({ id: credentialReferences.id, name: credentialReferences.name, type: credentialReferences.type })

    reply.code(201).send({ success: true, data: cred })
  })

  // DELETE /api/v1/projects/:projectId/credentials/:credId
  app.delete('/api/v1/projects/:projectId/credentials/:credId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, credId } = req.params as { projectId: string; credId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.delete(credentialReferences).where(eq(credentialReferences.id, credId))
    reply.code(204).send()
  })

  // --- Environments ---

  // GET /api/v1/projects/:projectId/environments
  app.get('/api/v1/projects/:projectId/environments', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const envs = await db.select().from(environments)
      .where(eq(environments.projectId, projectId))

    reply.send({ success: true, data: envs })
  })

  // POST /api/v1/projects/:projectId/environments
  app.post('/api/v1/projects/:projectId/environments', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      name: z.string().min(1).max(100),
      baseUrl: z.string().url(),
      isDefault: z.boolean().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [env] = await db.insert(environments).values({
      projectId,
      name: body.data.name,
      baseUrl: body.data.baseUrl,
      isDefault: body.data.isDefault ?? false,
    }).returning()

    reply.code(201).send({ success: true, data: env })
  })

  // DELETE /api/v1/projects/:projectId/environments/:envId
  app.delete('/api/v1/projects/:projectId/environments/:envId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, envId } = req.params as { projectId: string; envId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.delete(environments).where(eq(environments.id, envId))
    reply.code(204).send()
  })

  // --- API Keys ---

  // GET /api/v1/projects/:projectId/api-keys
  app.get('/api/v1/projects/:projectId/api-keys', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const keys = await db.select({
      id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt,
    }).from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt)))

    reply.send({ success: true, data: keys })
  })

  // POST /api/v1/projects/:projectId/api-keys
  app.post('/api/v1/projects/:projectId/api-keys', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({ name: z.string().min(1).max(255) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const rawKey = generateApiKey()
    const hash = hashApiKey(rawKey)
    const prefix = rawKey.slice(0, 12) + '...'

    await db.insert(apiKeys).values({
      projectId, ownerId: userId, name: body.data.name, keyHash: hash, keyPrefix: prefix,
    })

    // Return the raw key ONCE — never stored, never retrievable again
    reply.code(201).send({ success: true, data: { key: rawKey, name: body.data.name, prefix } })
  })

  // DELETE /api/v1/projects/:projectId/api-keys/:keyId (revoke)
  app.delete('/api/v1/projects/:projectId/api-keys/:keyId', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, keyId } = req.params as { projectId: string; keyId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, keyId))
    reply.code(204).send()
  })
}
