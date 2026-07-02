import type { FastifyInstance } from 'fastify'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

const TOKEN_TTL_MS = 60_000 // 60 seconds

function getSecret(): Buffer {
  const s = process.env['STREAM_TOKEN_SECRET']
  if (!s) throw new Error('STREAM_TOKEN_SECRET is not set')
  return Buffer.from(s, 'utf8')
}

function signToken(payload: { userId: string; projectId: string; expiresAt: number }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyStreamToken(token: string): { userId: string; projectId: string } | null {
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null

    const expected = createHmac('sha256', getSecret()).update(data).digest('base64url')
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      userId: string; projectId: string; expiresAt: number
    }
    if (payload.expiresAt < Date.now()) return null

    return { userId: payload.userId, projectId: payload.projectId }
  } catch {
    return null
  }
}

export async function streamTokenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.post('/api/v1/projects/:projectId/stream-token', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const expiresAt = Date.now() + TOKEN_TTL_MS
    const token = signToken({ userId, projectId, expiresAt })

    reply.send({ success: true, data: { token, expiresAt: new Date(expiresAt).toISOString() } })
  })
}
