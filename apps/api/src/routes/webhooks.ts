import type { FastifyInstance } from 'fastify'
import { createHmac, timingSafeEqual } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { Queue } from 'bullmq'
import { getDb, projects, executionRuns, endpoints, environments } from '@speclyn/db'
import { getRedisConnection } from '@speclyn/shared-types'
import type { GenerateTestsJobPayload } from '@speclyn/shared-types'

function getGenerateQueue(): Queue {
  return new Queue('generate-tests', { connection: getRedisConnection() })
}

function verifyGithubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch { return false }
}

/** Resolve the base URL for a project: use default environment, then env var fallback. */
async function resolveBaseUrl(projectId: string): Promise<string> {
  const db = getDb()
  const [defaultEnv] = await db
    .select({ baseUrl: environments.baseUrl })
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.isDefault, true)))
  if (defaultEnv?.baseUrl) return defaultEnv.baseUrl

  const [anyEnv] = await db
    .select({ baseUrl: environments.baseUrl })
    .from(environments)
    .where(eq(environments.projectId, projectId))
  if (anyEnv?.baseUrl) return anyEnv.baseUrl

  return process.env['FALLBACK_BASE_URL'] ?? 'http://localhost:3000'
}

interface GithubPRPayload {
  action: string
  pull_request: {
    number: number
    head: { sha: string; ref: string }
    base: { ref: string }
    html_url: string
  }
  repository: { full_name: string }
  installation?: { id: number }
}

interface BitbucketPRPayload {
  pullrequest: {
    id: number
    source: { commit: { hash: string }; branch: { name: string } }
    destination: { branch: { name: string } }
    links: { html: { href: string } }
  }
  repository: { full_name: string; workspace: { slug: string } }
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // GitHub App webhook — no auth (verified by HMAC signature)
  app.post('/api/v1/webhooks/github', async (req, reply) => {
    const secret = process.env['GITHUB_WEBHOOK_SECRET']
    if (!secret) return reply.code(500).send({ error: 'GITHUB_WEBHOOK_SECRET not configured' })

    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const rawBody = JSON.stringify(req.body)
    if (!verifyGithubSignature(rawBody, signature, secret)) {
      return reply.code(401).send({ error: 'Invalid signature' })
    }

    const event = req.headers['x-github-event'] as string
    if (event !== 'pull_request') {
      return reply.send({ success: true, data: { skipped: true, event } })
    }

    const payload = req.body as GithubPRPayload
    if (!['opened', 'synchronize'].includes(payload.action)) {
      return reply.send({ success: true, data: { skipped: true, action: payload.action } })
    }

    const repoFullName = payload.repository.full_name
    const db = getDb()

    const [project] = await db.select().from(projects)
      .where(eq(projects.githubRepo, repoFullName))
    if (!project) {
      return reply.send({ success: true, data: { skipped: true, reason: 'No linked project' } })
    }

    const eps = await db.select({ id: endpoints.id }).from(endpoints)
      .where(eq(endpoints.projectId, project.id))
    if (eps.length === 0) {
      return reply.send({ success: true, data: { skipped: true, reason: 'No endpoints' } })
    }

    const [run] = await db.insert(executionRuns).values({
      projectId: project.id, status: 'pending',
    }).returning()
    if (!run) return reply.code(500).send({ error: 'Failed to create run' })

    const baseUrl = await resolveBaseUrl(project.id)

    await getGenerateQueue().add('generate', {
      projectId: project.id, runId: run.id,
      endpointIds: eps.map(e => e.id),
      ownerId: project.ownerId, baseUrl,
    } satisfies GenerateTestsJobPayload, { attempts: 1 })

    console.log(`[github-webhook] PR #${payload.pull_request.number} on ${repoFullName} → run ${run.id} (baseUrl: ${baseUrl})`)
    reply.send({ success: true, data: { runId: run.id, pr: payload.pull_request.number, repo: repoFullName } })
  })

  // Bitbucket webhook
  app.post('/api/v1/webhooks/bitbucket', async (req, reply) => {
    const event = req.headers['x-event-key'] as string
    if (event !== 'pullrequest:created' && event !== 'pullrequest:updated') {
      return reply.send({ success: true, data: { skipped: true, event } })
    }

    const payload = req.body as BitbucketPRPayload
    const workspace = payload.repository.workspace.slug
    const repoSlug = payload.repository.full_name

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.bitbucketWorkspace, workspace), eq(projects.bitbucketRepo, repoSlug)))
    if (!project) {
      return reply.send({ success: true, data: { skipped: true, reason: 'No linked project' } })
    }

    const eps = await db.select({ id: endpoints.id }).from(endpoints)
      .where(eq(endpoints.projectId, project.id))
    if (eps.length === 0) {
      return reply.send({ success: true, data: { skipped: true, reason: 'No endpoints' } })
    }

    const [run] = await db.insert(executionRuns).values({
      projectId: project.id, status: 'pending',
    }).returning()
    if (!run) return reply.code(500).send({ error: 'Failed to create run' })

    const baseUrl = await resolveBaseUrl(project.id)

    await getGenerateQueue().add('generate', {
      projectId: project.id, runId: run.id,
      endpointIds: eps.map(e => e.id),
      ownerId: project.ownerId, baseUrl,
    } satisfies GenerateTestsJobPayload, { attempts: 1 })

    console.log(`[bitbucket-webhook] PR #${payload.pullrequest.id} on ${repoSlug} → run ${run.id} (baseUrl: ${baseUrl})`)
    reply.send({ success: true, data: { runId: run.id, pr: payload.pullrequest.id, repo: repoSlug } })
  })
}
