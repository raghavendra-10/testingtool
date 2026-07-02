import type { FastifyRequest, FastifyReply } from 'fastify'
import { createHash } from 'crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb, apiKeys } from '@speclyn/db'

export interface ApiKeyAuthRequest extends FastifyRequest {
  apiKeyProjectId: string
  apiKeyOwnerId: string
}

/**
 * Authenticate via X-API-Key header. Used by CLI and CI integrations.
 * Falls through to Clerk auth if no API key is present.
 */
export async function apiKeyAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const key = req.headers['x-api-key'] as string | undefined
  if (!key) return // let Clerk auth handle it

  const hash = createHash('sha256').update(key).digest('hex')
  const db = getDb()

  const [record] = await db.select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))

  if (!record) {
    reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } })
    return
  }

  // Update last used timestamp (fire-and-forget)
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, record.id))

  ;(req as ApiKeyAuthRequest).apiKeyProjectId = record.projectId
  ;(req as ApiKeyAuthRequest).apiKeyOwnerId = record.ownerId
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  const bytes = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)))
  return `sk_live_${bytes.toString('base64url')}`
}
