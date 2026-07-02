import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { Queue } from 'bullmq'
import { getDb, projects, repositoryConnections } from '@speclyn/db'
import { encryptCredential } from '@speclyn/vault'
import { getRedisConnection } from '@speclyn/shared-types'
import type { AnalyzeRepoJobPayload } from '@speclyn/shared-types'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { Redis } from 'ioredis'

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })
const WEB_BASE = process.env['NEXT_PUBLIC_APP_URL'] ?? process.env['ALLOWED_ORIGINS']?.split(',')[0] ?? 'http://localhost:3002'

function getRepoQueue(): Queue {
  return new Queue('analyze-repo', { connection: getRedisConnection() })
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {

  // ── GitHub OAuth ───────────────────────────────────────────────────────────

  // Step 1: Redirect user to GitHub
  app.get('/api/v1/oauth/github/authorize', async (req, reply) => {
    const { projectId } = req.query as { projectId?: string }
    const state = randomBytes(16).toString('hex')

    // Store state + projectId in Redis (expires 10 min)
    await redis.set(`oauth:state:${state}`, JSON.stringify({ projectId, platform: 'github' }), 'EX', 600)

    const params = new URLSearchParams({
      client_id: process.env['GITHUB_CLIENT_ID'] ?? '',
      redirect_uri: process.env['GITHUB_CALLBACK_URL'] ?? '',
      scope: 'repo',
      state,
    })

    reply.redirect(`https://github.com/login/oauth/authorize?${params}`)
  })

  // Step 2: GitHub callback — exchange code for token
  app.get('/api/v1/oauth/github/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string }
    if (!code || !state) return reply.code(400).send('Missing code or state')

    // Verify state
    const stateData = await redis.get(`oauth:state:${state}`)
    if (!stateData) return reply.code(400).send('Invalid or expired state')
    await redis.del(`oauth:state:${state}`)

    const { projectId } = JSON.parse(stateData) as { projectId: string }

    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env['GITHUB_CLIENT_ID'],
        client_secret: process.env['GITHUB_CLIENT_SECRET'],
        code,
        redirect_uri: process.env['GITHUB_CALLBACK_URL'],
      }),
    })
    const tokenBody = await tokenRes.json() as { access_token?: string; error?: string }
    if (!tokenBody.access_token) return reply.code(400).send(`GitHub OAuth failed: ${tokenBody.error}`)

    // Store encrypted token in Redis temporarily (user picks repos on frontend)
    const tempKey = `oauth:token:${randomBytes(8).toString('hex')}`
    await redis.set(tempKey, JSON.stringify({
      platform: 'github',
      accessToken: tokenBody.access_token,
      projectId,
    }), 'EX', 600)

    // Redirect back to frontend with temp key
    reply.redirect(`${WEB_BASE}/projects/${projectId}/repositories?oauth=success&key=${tempKey}&platform=github`)
  })

  // ── Bitbucket OAuth ────────────────────────────────────────────────────────

  app.get('/api/v1/oauth/bitbucket/authorize', async (req, reply) => {
    const { projectId } = req.query as { projectId?: string }
    const state = randomBytes(16).toString('hex')

    await redis.set(`oauth:state:${state}`, JSON.stringify({ projectId, platform: 'bitbucket' }), 'EX', 600)

    const params = new URLSearchParams({
      client_id: process.env['BITBUCKET_CLIENT_ID'] ?? '',
      response_type: 'code',
      state,
    })

    reply.redirect(`https://bitbucket.org/site/oauth2/authorize?${params}`)
  })

  app.get('/api/v1/oauth/bitbucket/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string }
    if (!code || !state) return reply.code(400).send('Missing code or state')

    const stateData = await redis.get(`oauth:state:${state}`)
    if (!stateData) return reply.code(400).send('Invalid or expired state')
    await redis.del(`oauth:state:${state}`)

    const { projectId } = JSON.parse(stateData) as { projectId: string }

    // Exchange code for access token
    const tokenRes = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${process.env['BITBUCKET_CLIENT_ID']}:${process.env['BITBUCKET_CLIENT_SECRET']}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    })
    const tokenBody = await tokenRes.json() as { access_token?: string; refresh_token?: string; error?: string }
    if (!tokenBody.access_token) return reply.code(400).send(`Bitbucket OAuth failed: ${tokenBody.error}`)

    const tempKey = `oauth:token:${randomBytes(8).toString('hex')}`
    await redis.set(tempKey, JSON.stringify({
      platform: 'bitbucket',
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token ?? null,
      projectId,
    }), 'EX', 600)

    reply.redirect(`${WEB_BASE}/projects/${projectId}/repositories?oauth=success&key=${tempKey}&platform=bitbucket`)
  })

  // ── Authenticated routes (require Clerk JWT) ───────────────────────────────

  await app.register(async (authed) => {
    authed.addHook('preHandler', clerkAuth)

    // GET /api/v1/oauth/repos?key=<tempKey> — list repos from OAuth token
    authed.get('/api/v1/oauth/repos', async (req, reply) => {
      const { key } = req.query as { key?: string }
      if (!key) return reply.code(400).send({ success: false, error: { code: 'MISSING_KEY' } })

      const data = await redis.get(key)
      if (!data) return reply.code(400).send({ success: false, error: { code: 'EXPIRED', message: 'OAuth session expired. Please reconnect.' } })

      const { platform, accessToken } = JSON.parse(data) as { platform: string; accessToken: string }

      if (platform === 'github') {
        type GithubRepo = { full_name: string; clone_url: string; default_branch: string; private: boolean }
        const ghHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }

        // Step 1: Get all orgs the user belongs to
        const orgsRes = await fetch('https://api.github.com/user/orgs?per_page=100', { headers: ghHeaders })
        const orgs = await orgsRes.json() as Array<{ login: string }> | { message: string }

        const orgLogins: string[] = Array.isArray(orgs) ? orgs.map(o => o.login) : []
        console.log(`[oauth] GitHub orgs: ${orgLogins.join(', ') || '(none)'}`)

        // Step 2: Fetch personal repos + org repos in parallel
        const fetchAll = async (url: string): Promise<GithubRepo[]> => {
          const r = await fetch(url, { headers: ghHeaders })
          const body = await r.json()
          return Array.isArray(body) ? body as GithubRepo[] : []
        }

        const [personalRepos, ...orgRepoLists] = await Promise.all([
          fetchAll('https://api.github.com/user/repos?type=owner&per_page=100&sort=updated'),
          ...orgLogins.map(org => fetchAll(`https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated&type=all`)),
        ])

        // Merge and deduplicate by full_name
        const seen = new Set<string>()
        const allRepos: GithubRepo[] = []
        for (const repo of [...(personalRepos ?? []), ...orgRepoLists.flat()]) {
          if (!seen.has(repo.full_name)) {
            seen.add(repo.full_name)
            allRepos.push(repo)
          }
        }

        console.log(`[oauth] GitHub total repos: ${allRepos.length}`)

        return reply.send({
          success: true,
          data: allRepos.map(r => ({ name: r.full_name, cloneUrl: r.clone_url, branch: r.default_branch, private: r.private })),
        })
      }

      if (platform === 'bitbucket') {
        type BitbucketRepo = { full_name: string; links: { clone: Array<{ name: string; href: string }> }; mainbranch?: { name: string }; is_private?: boolean }

        // Step 1: Get all workspaces the user belongs to
        const wsRes = await fetch('https://api.bitbucket.org/2.0/user/workspaces?pagelen=100', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const wsBody = await wsRes.json() as { values?: Array<{ slug?: string; workspace?: { slug: string } }>; error?: { message: string } }

        if (wsBody.error || !wsBody.values) {
          console.warn('[oauth] Bitbucket workspaces error:', JSON.stringify(wsBody))
          return reply.send({ success: true, data: [] })
        }

        // /2.0/user/workspaces returns membership objects with nested workspace
        const workspaceSlugs = wsBody.values
          .map(w => w.workspace?.slug ?? w.slug)
          .filter((s): s is string => !!s)

        console.log(`[oauth] Bitbucket workspaces: ${workspaceSlugs.join(', ')}`)
        if (wsBody.values.length > 0 && workspaceSlugs.length === 0) {
          console.warn('[oauth] Bitbucket workspace response structure:', JSON.stringify(wsBody.values[0]))
        }

        // Step 2: Fetch repos from each workspace (workspace-scoped endpoint replaces deprecated global one)
        const repoResponses = await Promise.all(
          workspaceSlugs.map(slug =>
            fetch(`https://api.bitbucket.org/2.0/repositories/${slug}?pagelen=50&sort=-updated_on`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }).then(r => r.json() as Promise<{ values?: BitbucketRepo[]; error?: { message: string } }>)
          )
        )

        // Merge and deduplicate by full_name
        const seen = new Set<string>()
        const allRepos: BitbucketRepo[] = []
        for (const body of repoResponses) {
          if (body.error) {
            console.warn('[oauth] Bitbucket workspace repos error:', JSON.stringify(body))
            continue
          }
          for (const r of body.values ?? []) {
            if (!seen.has(r.full_name)) {
              seen.add(r.full_name)
              allRepos.push(r)
            }
          }
        }

        console.log(`[oauth] Bitbucket total repos: ${allRepos.length}`)

        return reply.send({
          success: true,
          data: allRepos.map(r => ({
            name: r.full_name,
            cloneUrl: r.links.clone.find(c => c.name === 'https')?.href ?? '',
            branch: r.mainbranch?.name ?? 'main',
            private: r.is_private ?? true,
          })),
        })
      }

      reply.code(400).send({ success: false, error: { code: 'UNSUPPORTED_PLATFORM' } })
    })

    // POST /api/v1/oauth/connect — save selected repo with OAuth token
    authed.post('/api/v1/oauth/connect', async (req, reply) => {
      const { userId } = req as AuthenticatedRequest
      const body = req.body as { key: string; projectId: string; repoUrl: string; branch: string }

      const data = await redis.get(body.key)
      if (!data) return reply.code(400).send({ success: false, error: { code: 'EXPIRED' } })

      const { platform, accessToken, refreshToken } = JSON.parse(data) as { platform: string; accessToken: string; refreshToken?: string | null }

      const db = getDb()
      const [project] = await db.select().from(projects).where(and(eq(projects.id, body.projectId), eq(projects.ownerId, userId)))
      if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

      const encrypted = encryptCredential(accessToken)
      const encryptedRefresh = refreshToken ? encryptCredential(refreshToken) : null
      const repoUrl = body.repoUrl.replace(/^git\s+clone\s+/i, '').trim()

      const [conn] = await db.insert(repositoryConnections).values({
        projectId: body.projectId,
        platform,
        repoUrl,
        branch: body.branch,
        encryptedToken: encrypted,
        encryptedRefreshToken: encryptedRefresh,
        status: 'pending',
      }).returning()

      if (conn) {
        await getRepoQueue().add('analyze', {
          repositoryConnectionId: conn.id,
          projectId: body.projectId,
          cloneUrl: repoUrl,
          branch: body.branch,
          credentialId: conn.id,
          ownerId: userId,
        } satisfies AnalyzeRepoJobPayload, { attempts: 2 })
      }

      // Clean up temp key
      await redis.del(body.key)

      reply.code(201).send({ success: true, data: { id: conn?.id, status: 'pending' } })
    })
  })
}
