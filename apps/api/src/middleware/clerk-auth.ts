import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '@clerk/backend'

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string
}

export async function clerkAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  const secretKey = process.env['CLERK_SECRET_KEY']
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set')

  try {
    const payload = await verifyToken(token, { secretKey })
    ;(request as AuthenticatedRequest).userId = payload.sub
  } catch {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' })
  }
}
