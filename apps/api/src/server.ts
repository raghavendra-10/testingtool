import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { healthRoutes } from './routes/health.js'
import { projectRoutes } from './routes/projects.js'
import { documentRoutes } from './routes/documents.js'
import { requirementRoutes } from './routes/requirements.js'
import { endpointRoutes } from './routes/endpoints.js'
import { streamTokenRoutes } from './routes/stream-token.js'
import { sseRoutes } from './routes/sse.js'
import { wsRoutes } from './routes/ws.js'
import { executionRoutes } from './routes/execution.js'
import { coverageRoutes } from './routes/coverage.js'
import { defectRoutes } from './routes/defects.js'
import { credentialRoutes } from './routes/credentials.js'
import { webhookRoutes } from './routes/webhooks.js'
import { testRoutes } from './routes/tests.js'
import { suiteRoutes } from './routes/suites.js'
import { scheduleRoutes } from './routes/schedules.js'
import { trendRoutes } from './routes/trends.js'
import { auditRoutes } from './routes/audit.js'
import { outboundWebhookRoutes } from './routes/outbound-webhooks.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { repositoryRoutes } from './routes/repositories.js'
import { evidenceRoutes } from './routes/evidence.js'
import { oauthRoutes } from './routes/oauth.js'
import { PINO_REDACT_PATHS } from '@speclyn/shared-types'

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    redact: PINO_REDACT_PATHS,
  },
})

await app.register(cors, {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3002'],
  credentials: true,
})

await app.register(multipart)
await app.register(websocket)

// Allow empty JSON bodies (e.g. POST with no payload)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || body === '') { done(null, {}); return }
  try { done(null, JSON.parse(body as string)) } catch (e) { done(e as Error, undefined) }
})

// Routes
await app.register(healthRoutes)
await app.register(projectRoutes)
await app.register(documentRoutes)
await app.register(requirementRoutes)
await app.register(endpointRoutes)
await app.register(streamTokenRoutes)
await app.register(sseRoutes)
await app.register(wsRoutes)
await app.register(executionRoutes)
await app.register(coverageRoutes)
await app.register(defectRoutes)
await app.register(credentialRoutes)
await app.register(webhookRoutes)
await app.register(testRoutes)
await app.register(suiteRoutes)
await app.register(scheduleRoutes)
await app.register(trendRoutes)
await app.register(auditRoutes)
await app.register(outboundWebhookRoutes)
await app.register(dashboardRoutes)
await app.register(repositoryRoutes)
await app.register(evidenceRoutes)
await app.register(oauthRoutes)

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' })
})

const port = Number(process.env['PORT'] ?? 3001)
const host = process.env['HOST'] ?? '0.0.0.0'

try {
  await app.listen({ port, host })
  app.log.info(`API listening on ${host}:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
