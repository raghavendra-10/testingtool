import type { FastifyInstance } from 'fastify'
import { createHmac } from 'crypto'
import { Queue } from 'bullmq'
import { eq } from 'drizzle-orm'
import { getDb, projects, repositoryConnections } from '@speclyn/db'
import { getRedisConnection } from '@speclyn/shared-types'
import type { AnalyzeRepoJobPayload } from '@speclyn/shared-types'

function getRepoQueue(): Queue {
  return new Queue('analyze-repo', { connection: getRedisConnection() })
}

/**
 * Inbound webhooks from GitHub/Bitbucket push events.
 * Triggers incremental repo analysis on push to the tracked branch.
 */
export async function webhookInboundRoutes(app: FastifyInstance): Promise<void> {

  // GitHub push webhook
  app.post('/api/v1/webhooks/scm/github', async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const event = req.headers['x-github-event'] as string | undefined

    if (event !== 'push') {
      return reply.code(200).send({ success: true, message: 'Ignored non-push event' })
    }

    const body = req.body as {
      ref?: string
      repository?: { clone_url?: string; full_name?: string }
      commits?: Array<{ added?: string[]; modified?: string[]; removed?: string[] }>
    }

    const branch = body.ref?.replace('refs/heads/', '') ?? 'main'
    const repoFullName = body.repository?.full_name

    if (!repoFullName) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing repository info' } })
    }

    // Find matching project+connection
    const db = getDb()
    const connections = await db.select().from(repositoryConnections)
      .where(eq(repositoryConnections.platform, 'github'))

    const matchedConn = connections.find(c =>
      c.repoUrl.includes(repoFullName) && c.branch === branch
    )

    if (!matchedConn) {
      return reply.code(200).send({ success: true, message: 'No matching connection found' })
    }

    // Collect changed files
    const changedFiles: string[] = []
    for (const commit of body.commits ?? []) {
      changedFiles.push(...(commit.added ?? []), ...(commit.modified ?? []))
    }

    // Enqueue incremental analysis
    await getRepoQueue().add('analyze', {
      repositoryConnectionId: matchedConn.id,
      projectId: matchedConn.projectId,
      cloneUrl: matchedConn.repoUrl,
      branch: matchedConn.branch,
      credentialId: '',
      ownerId: '',
    } satisfies AnalyzeRepoJobPayload, { attempts: 1 })

    console.log(`[webhooks-inbound] GitHub push to ${repoFullName}/${branch} — ${changedFiles.length} files changed, analysis enqueued`)

    reply.send({ success: true, message: 'Analysis triggered', changedFiles: changedFiles.length })
  })

  // Bitbucket push webhook
  app.post('/api/v1/webhooks/scm/bitbucket', async (req, reply) => {
    const event = req.headers['x-event-key'] as string | undefined

    if (event !== 'repo:push') {
      return reply.code(200).send({ success: true, message: 'Ignored non-push event' })
    }

    const body = req.body as {
      repository?: { full_name?: string }
      push?: { changes?: Array<{ new?: { name?: string } }> }
    }

    const repoFullName = body.repository?.full_name
    const branch = body.push?.changes?.[0]?.new?.name ?? 'main'

    if (!repoFullName) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing repository info' } })
    }

    const db = getDb()
    const connections = await db.select().from(repositoryConnections)
      .where(eq(repositoryConnections.platform, 'bitbucket'))

    const matchedConn = connections.find(c =>
      c.repoUrl.includes(repoFullName) && c.branch === branch
    )

    if (!matchedConn) {
      return reply.code(200).send({ success: true, message: 'No matching connection found' })
    }

    await getRepoQueue().add('analyze', {
      repositoryConnectionId: matchedConn.id,
      projectId: matchedConn.projectId,
      cloneUrl: matchedConn.repoUrl,
      branch: matchedConn.branch,
      credentialId: '',
      ownerId: '',
    } satisfies AnalyzeRepoJobPayload, { attempts: 1 })

    console.log(`[webhooks-inbound] Bitbucket push to ${repoFullName}/${branch} — analysis enqueued`)

    reply.send({ success: true, message: 'Analysis triggered' })
  })
}
