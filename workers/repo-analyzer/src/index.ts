import { Worker } from 'bullmq'
import { execa } from 'execa'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { Redis } from 'ioredis'
import { getDb, endpoints, repositoryConnections, repoFileIndex, repoServices } from '@speclyn/db'
import { eq } from 'drizzle-orm'
import { getRedisConnection, bootstrapWorker } from '@speclyn/shared-types'
import type { AnalyzeRepoJobPayload } from '@speclyn/shared-types'
import { decryptCredential } from '@speclyn/vault'
import { isOpenApiSpec, isPostmanCollection, parseOpenApi, parsePostman } from '@speclyn/agents'
import { detectStack } from './stack-detector.js'
import { extractRoutes } from './route-extractor.js'
import { readFileSync, existsSync } from 'fs'
import { discoverFiles, selectAnalyzableFiles, detectWorkspaces } from '@speclyn/repo-utils'

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null })

const SPEC_FILE_PATTERNS = [
  'openapi.json', 'openapi.yaml', 'openapi.yml',
  'swagger.json', 'swagger.yaml', 'swagger.yml',
  'api-spec.json', 'api-spec.yaml',
  'docs/openapi.json', 'docs/openapi.yaml',
  'docs/swagger.json', 'docs/swagger.yaml',
]

const worker = new Worker<AnalyzeRepoJobPayload>(
  'analyze-repo',
  async (job) => {
    const { repositoryConnectionId, projectId, cloneUrl, branch, credentialId } = job.data
    const db = getDb()

    await db.update(repositoryConnections)
      .set({ status: 'analyzing' })
      .where(eq(repositoryConnections.id, repositoryConnectionId))

    const tempDir = await mkdtemp(join(tmpdir(), 'speclyn-repo-'))

    try {
      // Decrypt access token
      const [conn] = await db.select().from(repositoryConnections)
        .where(eq(repositoryConnections.id, repositoryConnectionId))
      if (!conn) throw new Error('Repository connection not found')

      let token = decryptCredential(conn.encryptedToken)

      // For Bitbucket, refresh the access token before cloning — tokens expire in 2 hours
      // and jobs may sit in the queue longer than that.
      if (conn.platform === 'bitbucket' && conn.encryptedRefreshToken) {
        const refreshToken = decryptCredential(conn.encryptedRefreshToken)
        const refreshRes = await fetch('https://bitbucket.org/site/oauth2/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(
              `${process.env['BITBUCKET_CLIENT_ID']}:${process.env['BITBUCKET_CLIENT_SECRET']}`
            ).toString('base64'),
          },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        })
        const refreshBody = await refreshRes.json() as { access_token?: string; refresh_token?: string; error?: string }
        if (refreshBody.access_token) {
          token = refreshBody.access_token
          // Persist the new tokens so subsequent re-analyze jobs work too
          const { encryptCredential } = await import('@speclyn/vault')
          await db.update(repositoryConnections).set({
            encryptedToken: encryptCredential(refreshBody.access_token),
            ...(refreshBody.refresh_token ? { encryptedRefreshToken: encryptCredential(refreshBody.refresh_token) } : {}),
          }).where(eq(repositoryConnections.id, repositoryConnectionId))
        } else {
          console.warn(`[repo-analyzer] Bitbucket token refresh failed: ${refreshBody.error} — falling back to stored token`)
        }
      }

      // Build authenticated clone URL — strip "git clone " prefix and any existing username
      const cleanUrl = cloneUrl.replace(/^git\s+clone\s+/i, '').trim()
      const url = new URL(cleanUrl.replace(/\/\/[^@]+@/, '//'))
      const cleanPath = url.pathname.replace(/\.git$/, '') + '.git'
      let authUrl: string
      switch (conn.platform) {
        case 'github':
          authUrl = `https://x-access-token:${token}@${url.host}${cleanPath}`
          break
        case 'bitbucket':
          // OAuth access tokens always use 'x-token-auth' as the literal username
          authUrl = `https://x-token-auth:${token}@${url.host}${cleanPath}`
          break
        case 'gitlab':
          authUrl = `https://oauth2:${token}@${url.host}${cleanPath}`
          break
        default:
          authUrl = cloneUrl
      }

      // Shallow clone — fall back to default branch if the stored branch doesn't exist
      console.log(`[repo-analyzer] Cloning ${conn.platform} repo: ${cloneUrl} (branch: ${branch})`)
      try {
        await execa('git', ['clone', '--depth', '1', '--branch', branch, authUrl, tempDir], {
          timeout: 120_000,
          env: { GIT_TERMINAL_PROMPT: '0' },
        })
      } catch (cloneErr) {
        const msg = String(cloneErr)
        const isBranchMissing = msg.includes('Remote branch') || msg.includes('not found in upstream') || msg.includes('Could not find remote branch')
        if (!isBranchMissing) throw cloneErr

        console.warn(`[repo-analyzer] Branch '${branch}' not found — cloning default branch`)
        await rm(tempDir, { recursive: true, force: true })
        await execa('git', ['clone', '--depth', '1', authUrl, tempDir], {
          timeout: 120_000,
          env: { GIT_TERMINAL_PROMPT: '0' },
        })

        // Detect actual default branch and update the stored value
        const { stdout: actualBranch } = await execa('git', ['-C', tempDir, 'rev-parse', '--abbrev-ref', 'HEAD'])
        console.log(`[repo-analyzer] Actual default branch: ${actualBranch}`)
        await db.update(repositoryConnections)
          .set({ branch: actualBranch.trim() })
          .where(eq(repositoryConnections.id, repositoryConnectionId))
      }

      // Detect stack
      const stack = detectStack(tempDir)
      console.log(`[repo-analyzer] Stack detected: ${JSON.stringify(stack)}`)

      // Extract routes via AST
      const astRoutes = extractRoutes(tempDir, stack.framework)
      console.log(`[repo-analyzer] Extracted ${astRoutes.length} routes via AST`)

      // Check for OpenAPI/Postman spec files in repo
      let specRoutes: Array<{ method: string; path: string; summary: string | null; source: string; requestBody: string | null; responses: string | null }> = []
      for (const pattern of SPEC_FILE_PATTERNS) {
        const specPath = join(tempDir, pattern)
        if (existsSync(specPath)) {
          const content = readFileSync(specPath, 'utf-8')
          if (isOpenApiSpec(content)) {
            const parsed = parseOpenApi(content)
            specRoutes = parsed.map(e => ({ ...e, source: 'openapi' }))
            console.log(`[repo-analyzer] Found OpenAPI spec: ${pattern} (${parsed.length} endpoints)`)
            break
          }
          if (isPostmanCollection(content)) {
            const parsed = parsePostman(content)
            specRoutes = parsed.map(e => ({ ...e, source: 'postman' }))
            console.log(`[repo-analyzer] Found Postman collection: ${pattern} (${parsed.length} endpoints)`)
            break
          }
        }
      }

      // Merge: spec routes take priority, AST routes fill gaps
      const allEndpoints = [
        ...specRoutes.map(e => ({
          projectId,
          method: e.method,
          path: e.path,
          summary: e.summary ?? '',
          source: e.source,
          requestBody: e.requestBody ?? null,
          responses: e.responses ?? null,
        })),
        ...astRoutes.map(e => ({
          projectId,
          method: e.method,
          path: e.path,
          summary: e.summary,
          source: 'ast' as const,
          requestBody: null,
          responses: null,
        })),
      ]

      // Insert endpoints (idempotent)
      if (allEndpoints.length > 0) {
        await db.insert(endpoints).values(allEndpoints).onConflictDoNothing()
      }

      // Update connection status
      await db.update(repositoryConnections).set({
        status: 'connected',
        lastAnalyzedAt: new Date(),
        endpointCount: allEndpoints.length,
        stackDetected: JSON.stringify(stack),
        errorMessage: null,
      }).where(eq(repositoryConnections.id, repositoryConnectionId))

      // ── Phase 1: Build file index (for incremental analysis) ──────────
      try {
        const repoFiles = await discoverFiles(tempDir)
        const analyzable = selectAnalyzableFiles(repoFiles, tempDir)

        // Batch upsert file index (chunks of 500)
        for (let i = 0; i < analyzable.length; i += 500) {
          const batch = analyzable.slice(i, i + 500).map(f => ({
            projectId,
            filePath: f.path,
            blobSha: f.blobSha,
            category: f.category,
            language: f.language,
          }))
          await db.insert(repoFileIndex).values(batch).onConflictDoNothing()
        }
        console.log(`[repo-analyzer] Indexed ${analyzable.length} files (${repoFiles.length} total in repo)`)

        // Detect workspaces for monorepo support
        const workspaces = detectWorkspaces(tempDir)
        if (workspaces.length > 0) {
          await db.insert(repoServices)
            .values(workspaces.map(w => ({
              projectId,
              serviceName: w.name,
              rootPath: w.rootPath,
              framework: w.framework,
              language: w.language,
            })))
            .onConflictDoNothing()
          console.log(`[repo-analyzer] Detected ${workspaces.length} services: ${workspaces.map(w => w.name).join(', ')}`)
        }
      } catch (indexErr) {
        console.warn(`[repo-analyzer] File indexing failed (non-fatal):`, String(indexErr).slice(0, 200))
      }

      // Publish WebSocket updates
      await publisher.publish(`project:${projectId}:updates`, JSON.stringify({ type: 'endpoints.updated' }))
      await publisher.publish(`project:${projectId}:updates`, JSON.stringify({ type: 'repositories.updated' }))

      console.log(`[repo-analyzer] Done — ${allEndpoints.length} endpoints discovered`)
    } catch (err) {
      // Redact tokens from error messages
      const errMsg = String(err).replace(/https?:\/\/[^@]+@/g, 'https://***@').slice(0, 1000)
      console.error(`[repo-analyzer] Failed:`, errMsg)
      await db.update(repositoryConnections).set({
        status: 'error',
        errorMessage: errMsg,
      }).where(eq(repositoryConnections.id, repositoryConnectionId))
      await publisher.publish(`project:${projectId}:updates`, JSON.stringify({ type: 'repositories.updated' }))
      throw err
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  },
  { connection: getRedisConnection(), concurrency: 1 },
)

worker.on('completed', job => console.log(`[repo-analyzer] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[repo-analyzer] Job ${job?.id} failed:`, err.message))

bootstrapWorker({ name: 'repo-analyzer', workers: [worker] })
