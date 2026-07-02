import type { FastifyRequest, FastifyReply } from 'fastify'
import { Redis } from 'ioredis'

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })

const WINDOW_MS = 60_000   // 1 minute
const MAX_REQUESTS = 120   // 120 requests per minute per API key

/**
 * Rate limiter using Redis sliding window.
 * Applies only to API-key-authenticated requests.
 */
export async function rateLimit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined
  if (!apiKey) return // no rate limit for Clerk-authenticated browser requests

  const key = `ratelimit:${apiKey.slice(0, 16)}`
  const now = Date.now()

  const multi = redis.multi()
  multi.zadd(key, String(now), `${now}:${Math.random()}`)
  multi.zremrangebyscore(key, '-inf', String(now - WINDOW_MS))
  multi.zcard(key)
  multi.pexpire(key, WINDOW_MS)

  const results = await multi.exec()
  const count = (results?.[2]?.[1] as number) ?? 0

  reply.header('X-RateLimit-Limit', String(MAX_REQUESTS))
  reply.header('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - count)))
  reply.header('X-RateLimit-Reset', String(Math.ceil((now + WINDOW_MS) / 1000)))

  if (count > MAX_REQUESTS) {
    reply.code(429).send({
      success: false,
      error: { code: 'RATE_LIMITED', message: `Rate limit exceeded. Max ${MAX_REQUESTS} requests per minute.` },
    })
  }
}
