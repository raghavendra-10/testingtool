import { Worker } from 'bullmq'
import { execa } from 'execa'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { Redis } from 'ioredis'
import { getDb, repositoryConnections, codeAnalysisRuns, codeIssues, schemaAnalysisRuns, schemaIssues } from '@speclyn/db'
import { eq } from 'drizzle-orm'
import { getRedisConnection } from '@speclyn/shared-types'
import type { CodeAnalysisJobPayload, SchemaAnalysisJobPayload } from '@speclyn/shared-types'
import { decryptCredential } from '@speclyn/vault'
import { JavaCodeAnalyzerAgent, SchemaAnalyzerAgent } from '@speclyn/agents'
import { walkSourceFiles } from './file-walker.js'

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null })

const codeAgent = new JavaCodeAnalyzerAgent()
const schemaAgent = new SchemaAnalyzerAgent()

// File extensions by language
const LANG_EXTENSIONS: Record<string, string[]> = {
  java:    ['.java'],
  python:  ['.py'],
  csharp:  ['.cs'],
  go:      ['.go'],
  kotlin:  ['.kt', '.kts'],
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx'],
}

// SQL migration file patterns
const SQL_PATTERNS = [
  'src/main/resources/db/migration',    // Flyway
  'src/main/resources/db/changelog',    // Liquibase
  'migrations',
  'database/migrations',
  'db/migrate',
  'sql',
]

// ─── Code Analysis Worker ──────────────────────────────────────────
const codeWorker = new Worker<CodeAnalysisJobPayload>(
  'analyze-code',
  async (job) => {
    const { projectId, runId, ownerId, language, analysisTypes } = job.data
    const db = getDb()

    await db.update(codeAnalysisRuns)
      .set({ status: 'analyzing', startedAt: new Date() })
      .where(eq(codeAnalysisRuns.id, runId))

    // Get the repo connection for this project
    const [repo] = await db.select().from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, projectId))

    if (!repo) {
      await db.update(codeAnalysisRuns)
        .set({ status: 'error', failureReason: 'No repository connected. Connect a GitHub/Bitbucket repo first.', completedAt: new Date() })
        .where(eq(codeAnalysisRuns.id, runId))
      return
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'speclyn-code-'))

    try {
      // Clone the repository
      let token = decryptCredential(repo.encryptedToken)

      if (repo.platform === 'bitbucket' && repo.encryptedRefreshToken) {
        const refreshToken = decryptCredential(repo.encryptedRefreshToken)
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
        const refreshBody = await refreshRes.json() as { access_token?: string; error?: string }
        if (refreshBody.access_token) token = refreshBody.access_token
      }

      const cleanUrl = repo.repoUrl.replace(/^git\s+clone\s+/i, '').trim()
      const url = new URL(cleanUrl.replace(/\/\/[^@]+@/, '//'))
      const cleanPath = url.pathname.replace(/\.git$/, '') + '.git'
      let authUrl: string
      switch (repo.platform) {
        case 'github':   authUrl = `https://x-access-token:${token}@${url.host}${cleanPath}`; break
        case 'bitbucket': authUrl = `https://x-token-auth:${token}@${url.host}${cleanPath}`; break
        case 'gitlab':   authUrl = `https://oauth2:${token}@${url.host}${cleanPath}`; break
        default:         authUrl = repo.repoUrl
      }

      console.log(`[code-analyzer] Cloning repo for analysis (lang: ${language})`)
      await execa('git', ['clone', '--depth', '1', '--branch', repo.branch, authUrl, tempDir], {
        timeout: 120_000,
        env: { GIT_TERMINAL_PROMPT: '0' },
      })

      // Walk source files
      const extensions = LANG_EXTENSIONS[language] ?? [`.${language}`]
      const files = await walkSourceFiles(tempDir, extensions)
      console.log(`[code-analyzer] Found ${files.length} ${language} files`)

      if (files.length === 0) {
        await db.update(codeAnalysisRuns)
          .set({ status: 'completed', totalFiles: 0, totalIssues: 0, completedAt: new Date() })
          .where(eq(codeAnalysisRuns.id, runId))
        return
      }

      // Budget-driven analysis: configurable limits replace the old 100-file cap
      const maxFiles = parseInt(process.env['CODE_ANALYSIS_MAX_FILES'] ?? '2000')
      const filesToAnalyze = files.slice(0, maxFiles)

      let totalIssues = 0
      let criticalCount = 0
      let highCount = 0
      let mediumCount = 0
      let lowCount = 0

      // Process files in batches of 5 (parallel per batch)
      const BATCH_SIZE = parseInt(process.env['CODE_ANALYSIS_BATCH_SIZE'] ?? '5')
      for (let i = 0; i < filesToAnalyze.length; i += BATCH_SIZE) {
        const batch = filesToAnalyze.slice(i, i + BATCH_SIZE)

        await Promise.all(batch.map(async (filePath) => {
          const relativePath = filePath.replace(tempDir + '/', '')
          const content = await readFile(filePath, 'utf-8')

          // Skip very small files (<5 lines)
          const lineCount = content.split('\n').length
          if (lineCount < 5) return

          // Large files: chunk on declaration boundaries instead of skipping
          const { chunkOnDeclarationBoundaries } = await import('./chunker.js')
          const chunks = chunkOnDeclarationBoundaries(content, relativePath, 400)

          for (const chunk of chunks) {
            const result = await codeAgent.run({
              projectId,
              fileName: `${relativePath} (${chunk.header})`,
              fileContent: chunk.content,
              language,
              analysisTypes,
            }, projectId)

            if (result.success && result.data) {
              for (const issue of result.data.issues) {
                await db.insert(codeIssues).values({
                  runId,
                  projectId,
                  category: issue.category,
                  severity: issue.severity,
                  title: issue.title,
                  description: issue.description,
                  filePath: relativePath,
                  lineNumber: issue.lineNumber,
                  codeSnippet: issue.codeSnippet,
                  recommendation: issue.recommendation,
                  ruleId: issue.ruleId,
                })

                totalIssues++
                switch (issue.severity) {
                  case 'critical': criticalCount++; break
                  case 'high':     highCount++; break
                  case 'medium':   mediumCount++; break
                  case 'low':      lowCount++; break
                }
              }
            }
          } // end chunks loop
        }))

        // Publish progress via SSE
        await publisher.publish(`project:${projectId}:updates`, JSON.stringify({
          type: 'code_analysis_progress',
          runId,
          filesProcessed: Math.min(i + BATCH_SIZE, filesToAnalyze.length),
          totalFiles: filesToAnalyze.length,
          issuesFound: totalIssues,
        }))
      }

      // Also scan for SQL migration files and analyze them if present
      let schemaContent = ''
      for (const pattern of SQL_PATTERNS) {
        const migrationDir = join(tempDir, pattern)
        try {
          const sqlFiles = await walkSourceFiles(migrationDir, ['.sql'])
          for (const f of sqlFiles.slice(0, 20)) {
            schemaContent += await readFile(f, 'utf-8') + '\n\n'
          }
          if (schemaContent) break
        } catch {
          // directory doesn't exist, skip
        }
      }

      // If SQL migrations found, auto-create a schema analysis
      if (schemaContent.length > 100) {
        console.log(`[code-analyzer] Found SQL migrations, auto-analyzing schema`)
        const [schemaRun] = await db.insert(schemaAnalysisRuns).values({
          projectId,
          status: 'analyzing',
          sourceType: 'repo',
          schemaSnapshot: schemaContent.slice(0, 50000),
          startedAt: new Date(),
        }).returning()

        if (schemaRun) {
          const schemaResult = await schemaAgent.run({
            projectId,
            schemaContent: schemaContent.slice(0, 30000),
            analysisTypes: ['table_structure', 'constraints', 'indexes', 'naming', 'multi_tenant', 'hipaa'],
          }, projectId)

          if (schemaResult.success && schemaResult.data) {
            let sTotalIssues = 0
            let sCritical = 0, sHigh = 0, sMedium = 0, sLow = 0

            for (const issue of schemaResult.data.issues) {
              await db.insert(schemaIssues).values({
                runId: schemaRun.id,
                projectId,
                category: issue.category,
                severity: issue.severity,
                tableName: issue.tableName,
                columnName: issue.columnName,
                title: issue.title,
                description: issue.description,
                recommendation: issue.recommendation,
                sqlSnippet: issue.sqlSnippet,
                ruleId: issue.ruleId,
              })
              sTotalIssues++
              switch (issue.severity) {
                case 'critical': sCritical++; break
                case 'high':     sHigh++; break
                case 'medium':   sMedium++; break
                case 'low':      sLow++; break
              }
            }

            await db.update(schemaAnalysisRuns).set({
              status: 'completed',
              totalTables: schemaResult.data.tables.length,
              totalIssues: sTotalIssues,
              criticalCount: sCritical,
              highCount: sHigh,
              mediumCount: sMedium,
              lowCount: sLow,
              completedAt: new Date(),
            }).where(eq(schemaAnalysisRuns.id, schemaRun.id))
          } else {
            await db.update(schemaAnalysisRuns).set({
              status: 'error',
              failureReason: schemaResult.error?.message ?? 'Schema analysis failed',
              completedAt: new Date(),
            }).where(eq(schemaAnalysisRuns.id, schemaRun.id))
          }
        }
      }

      // Finalize code analysis run
      await db.update(codeAnalysisRuns).set({
        status: 'completed',
        totalFiles: filesToAnalyze.length,
        totalIssues,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        completedAt: new Date(),
      }).where(eq(codeAnalysisRuns.id, runId))

      await publisher.publish(`project:${projectId}:updates`, JSON.stringify({
        type: 'code_analysis_completed',
        runId,
        totalFiles: filesToAnalyze.length,
        totalIssues,
      }))

      console.log(`[code-analyzer] Done — ${filesToAnalyze.length} files, ${totalIssues} issues`)
    } catch (err) {
      const errMsg = String(err).replace(/https?:\/\/[^@]+@/g, 'https://***@').slice(0, 1000)
      console.error(`[code-analyzer] Failed:`, errMsg)
      await db.update(codeAnalysisRuns).set({
        status: 'error',
        failureReason: errMsg,
        completedAt: new Date(),
      }).where(eq(codeAnalysisRuns.id, runId))
      throw err
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  },
  { connection: getRedisConnection(), concurrency: 1 },
)

// ─── Schema Analysis Worker (for uploaded SQL) ──────────────────────
const schemaWorker = new Worker<SchemaAnalysisJobPayload>(
  'analyze-schema',
  async (job) => {
    const { projectId, runId, schemaContent, analysisTypes } = job.data
    const db = getDb()

    await db.update(schemaAnalysisRuns)
      .set({ status: 'analyzing', startedAt: new Date() })
      .where(eq(schemaAnalysisRuns.id, runId))

    try {
      const result = await schemaAgent.run({
        projectId,
        schemaContent: schemaContent.slice(0, 30000),
        analysisTypes,
      }, projectId)

      if (!result.success || !result.data) {
        await db.update(schemaAnalysisRuns).set({
          status: 'error',
          failureReason: result.error?.message ?? 'Analysis failed',
          completedAt: new Date(),
        }).where(eq(schemaAnalysisRuns.id, runId))
        return
      }

      let totalIssues = 0
      let criticalCount = 0, highCount = 0, mediumCount = 0, lowCount = 0

      for (const issue of result.data.issues) {
        await db.insert(schemaIssues).values({
          runId,
          projectId,
          category: issue.category,
          severity: issue.severity,
          tableName: issue.tableName,
          columnName: issue.columnName,
          title: issue.title,
          description: issue.description,
          recommendation: issue.recommendation,
          sqlSnippet: issue.sqlSnippet,
          ruleId: issue.ruleId,
        })
        totalIssues++
        switch (issue.severity) {
          case 'critical': criticalCount++; break
          case 'high':     highCount++; break
          case 'medium':   mediumCount++; break
          case 'low':      lowCount++; break
        }
      }

      await db.update(schemaAnalysisRuns).set({
        status: 'completed',
        totalTables: result.data.tables.length,
        totalIssues,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        completedAt: new Date(),
      }).where(eq(schemaAnalysisRuns.id, runId))

      await publisher.publish(`project:${projectId}:updates`, JSON.stringify({
        type: 'schema_analysis_completed',
        runId,
        totalIssues,
      }))

      console.log(`[code-analyzer] Schema analysis done — ${result.data.tables.length} tables, ${totalIssues} issues`)
    } catch (err) {
      console.error(`[code-analyzer] Schema analysis error:`, err)
      await db.update(schemaAnalysisRuns).set({
        status: 'error',
        failureReason: String(err).slice(0, 1000),
        completedAt: new Date(),
      }).where(eq(schemaAnalysisRuns.id, runId))
      throw err
    }
  },
  { connection: getRedisConnection(), concurrency: 2 },
)

codeWorker.on('completed', job => console.log(`[code-analyzer] Code job ${job.id} completed`))
codeWorker.on('failed', (job, err) => console.error(`[code-analyzer] Code job ${job?.id} failed:`, err.message))
schemaWorker.on('completed', job => console.log(`[code-analyzer] Schema job ${job.id} completed`))
schemaWorker.on('failed', (job, err) => console.error(`[code-analyzer] Schema job ${job?.id} failed:`, err.message))

console.log('[code-analyzer] Workers started (code + schema)')
process.on('SIGTERM', async () => {
  await codeWorker.close()
  await schemaWorker.close()
  await publisher.quit()
  process.exit(0)
})
