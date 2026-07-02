import type { FastifyInstance } from 'fastify'
import { createRedisClient } from '../lib/redis.js'
import { verifyRunStreamToken } from '../lib/run-stream-token.js'
import { getDb, executionRuns, executionSteps, generatedTests } from '@speclyn/db'
import { eq, asc } from 'drizzle-orm'

const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000,http://localhost:3002').split(',')

export async function sseRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/projects/:projectId/runs/:runId/events',
    async (req, reply) => {
      const { projectId, runId } = req.params as { projectId: string; runId: string }
      const { token } = req.query as { token?: string }

      if (!token) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing stream token' })
      }

      const auth = verifyRunStreamToken(token)
      if (!auth || auth.projectId !== projectId) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired stream token' })
      }

      // Hijack: Fastify won't touch the response after this
      reply.hijack()

      const res = reply.raw
      const origin = req.headers['origin']
      const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': allowedOrigin,
      })

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      let cleaned = false
      const cleanup = async (sub: ReturnType<typeof createRedisClient>, hb: ReturnType<typeof setInterval>) => {
        if (cleaned) return
        cleaned = true
        clearInterval(hb)
        try { await sub.unsubscribe(); sub.disconnect() } catch {}
      }

      // Subscribe BEFORE snapshot (prevents race)
      const subscriber = createRedisClient()
      const channel = `project:${projectId}:run:${runId}`
      const buffered: string[] = []
      let snapshotDone = false

      subscriber.on('message', (_chan: string, message: string) => {
        if (!snapshotDone) { buffered.push(message); return }
        try {
          const parsed = JSON.parse(message) as { type?: string; status?: string }
          send('step', parsed)
          if (
            parsed.type === 'run_completed' ||
            (parsed.type === 'run_status' && ['passed', 'failed', 'error', 'cancelled'].includes(parsed.status ?? ''))
          ) {
            send('done', { status: parsed.status ?? 'done' })
            res.end()
            void cleanup(subscriber, heartbeat)
          }
        } catch {}
      })

      await subscriber.subscribe(channel)

      // Snapshot: replay existing execution steps with test names
      const db = getDb()
      const snapshot = await db
        .select({
          testId: executionSteps.testId,
          testName: generatedTests.name,
          status: executionSteps.status,
          durationMs: executionSteps.durationMs,
          errorMessage: executionSteps.errorMessage,
        })
        .from(executionSteps)
        .innerJoin(generatedTests, eq(executionSteps.testId, generatedTests.id))
        .where(eq(executionSteps.runId, runId))
        .orderBy(asc(executionSteps.createdAt))

      for (const step of snapshot) {
        send('step', {
          type: step.status === 'passed' ? 'step_completed' : 'step_failed',
          testId: step.testId,
          testName: step.testName,
          status: step.status,
          durationMs: step.durationMs,
          errorMessage: step.errorMessage,
        })
      }

      // If run already terminal, close immediately
      const [run] = await db
        .select({ status: executionRuns.status })
        .from(executionRuns)
        .where(eq(executionRuns.id, runId))

      const heartbeat = setInterval(() => { res.write(': heartbeat\n\n') }, 20_000)

      if (run != null && ['passed', 'failed', 'error', 'cancelled'].includes(run.status)) {
        send('done', { status: run.status })
        res.end()
        void cleanup(subscriber, heartbeat)
        return
      }

      // Go live
      snapshotDone = true
      for (const msg of buffered) {
        try { send('step', JSON.parse(msg)) } catch {}
      }
      buffered.length = 0

      req.raw.on('close', () => { void cleanup(subscriber, heartbeat) })
    },
  )
}
