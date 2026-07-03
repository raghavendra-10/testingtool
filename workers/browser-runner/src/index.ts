import { Worker, Queue } from 'bullmq'
import { writeFile, rm, mkdir, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { Redis } from 'ioredis'
import { execa } from 'execa'
import { randomUUID } from 'crypto'
import { getDb, executionRuns, executionSteps, generatedTests, evidence, credentialReferences } from '@speclyn/db'
import { eq, inArray } from 'drizzle-orm'
import { getRedisConnection, bootstrapWorker } from '@speclyn/shared-types'
import type { ExecuteTestsJobPayload, ClassifyFailuresPayload } from '@speclyn/shared-types'
import { decryptCredential } from '@speclyn/vault'
import { HealerAgent } from '@speclyn/agents'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BROWSER_HARNESS_DIR = join(__dirname, '../../../packages/browser-test-harness')
const GENERATED_DIR = join(BROWSER_HARNESS_DIR, 'generated')
const RESULTS_DIR = join(BROWSER_HARNESS_DIR, 'test-results')

const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})
const BUCKET = process.env['S3_BUCKET']!
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null })
const healerAgent = new HealerAgent()

function getReporterQueue(): Queue {
  return new Queue('generate-report', { connection: getRedisConnection() })
}

async function emitEvent(projectId: string, runId: string, event: object): Promise<void> {
  await publisher.publish(`project:${projectId}:run:${runId}`, JSON.stringify(event))
}

/** Upload a screenshot file to S3 and return its key. */
async function uploadScreenshot(filePath: string, projectId: string, stepId: string): Promise<string> {
  const { readFile } = await import('fs/promises')
  const buffer = await readFile(filePath)
  const key = `projects/${projectId}/evidence/${stepId}/${randomUUID()}.png`
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: 'image/png' }))
  return key
}

/** Find screenshot files captured by Playwright in test-results/ for a specific test. */
async function findScreenshots(testId: string): Promise<string[]> {
  try {
    const entries = await readdir(RESULTS_DIR, { recursive: true, withFileTypes: true })
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.png') && e.parentPath.includes(testId))
      .map(e => join(e.parentPath, e.name))
  } catch {
    return []
  }
}

// ─── Healer helpers ───────────────────────────────────────────────────────────

/** Detect selector-related failures in Playwright error output. */
function isSelectorError(errorMsg: string): boolean {
  return /locator\(|waitForSelector|page\.fill|page\.click|getBy|strict mode violation|selector .* not found|Timeout.*waiting for/i.test(errorMsg)
}

/** Extract the page URL from generated test code (looks for page.goto calls). */
function extractPageUrl(code: string): string | null {
  const m = code.match(/page\.goto\(['"]([^'"]+)['"]\)/)
  return m?.[1] ?? null
}

/** Extract the first failed selector from the error message. */
function extractFailedSelector(errorMsg: string): string | null {
  const patterns = [
    /locator\(['"]([^'"]+)['"]\)/,
    /selector\s+['"]([^'"]+)['"]/i,
    /waiting for\s+['"]([^'"]+)['"]/i,
    /(#[\w-]+|\.\w[\w-]+|\[data-\w[^\]]+\])/,
  ]
  for (const p of patterns) {
    const m = errorMsg.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

/** Try to heal a failed Playwright selector. Returns healed code + explanation, or null. */
async function tryHeal(
  projectId: string,
  test: { id: string; name: string; codeSnapshot: string | null },
  errorMessage: string,
  baseUrl: string,
): Promise<{ code: string; explanation: string; confidence: number } | null> {
  if (!test.codeSnapshot) return null
  const failedSelector = extractFailedSelector(errorMessage)
  if (!failedSelector) return null
  const pageUrl = extractPageUrl(test.codeSnapshot) ?? baseUrl

  let pageHtml = ''
  try {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    pageHtml = await page.content()
    await browser.close()
  } catch {
    return null // Can't fetch page — give up
  }

  try {
    const result = await healerAgent.run({
      projectId,
      testId: test.id,
      failedSelector,
      pageHtml,
      originalContext: errorMessage.slice(0, 500),
    }, projectId)

    if (!result.success || !result.data) return null
    const { proposedSelector, confidence, explanation, requiresReview } = result.data

    if (confidence < 0.75 || requiresReview) {
      console.log(`[browser-runner] Healer low confidence (${confidence.toFixed(2)}) for ${test.name} — skipping retry`)
      return null
    }

    // Patch the test code: replace old selector with new one
    const patchedCode = test.codeSnapshot.replace(
      new RegExp(failedSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      proposedSelector,
    )
    return { code: patchedCode, explanation, confidence }
  } catch {
    return null
  }
}

const worker = new Worker<ExecuteTestsJobPayload>(
  'execute-browser',
  async (job) => {
    const { projectId, runId, testIds, baseUrl } = job.data
    const db = getDb()

    try {
      await db.update(executionRuns)
        .set({ status: 'running', startedAt: new Date(), lastHeartbeatAt: new Date() })
        .where(eq(executionRuns.id, runId))

      await mkdir(GENERATED_DIR, { recursive: true })

      const tests = await db.select().from(generatedTests)
        .where(inArray(generatedTests.id, testIds))

      // Decrypt all project credentials into env vars
      const creds = await db.select().from(credentialReferences)
        .where(eq(credentialReferences.projectId, projectId))
      const credEnvMap: Record<string, string> = {}
      for (const cred of creds) {
        try {
          credEnvMap[`SPECLYN_CRED_${cred.id.replace(/-/g, '_').toUpperCase()}`] = decryptCredential(cred.encryptedValue)
        } catch { /* skip bad creds */ }
      }

      let passed = 0
      let failed = 0

      for (const test of tests) {
        // Check for cancellation
        const [currentRun] = await db.select({ status: executionRuns.status })
          .from(executionRuns).where(eq(executionRuns.id, runId))
        if (currentRun?.status === 'cancelled') {
          console.log(`[browser-runner] Run ${runId} cancelled, stopping`)
          return
        }

        await db.update(executionRuns)
          .set({ lastHeartbeatAt: new Date() })
          .where(eq(executionRuns.id, runId))

        if (!test.storageUrl) continue

        await emitEvent(projectId, runId, { type: 'step_started', testId: test.id, testName: test.name })

        const stepStarted = new Date()
        let stepStatus: 'passed' | 'failed' = 'failed'
        let errorMessage: string | null = null
        let durationMs = 0

        try {
          // Download test file from S3
          const s3Response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: test.storageUrl }))
          const chunks: Uint8Array[] = []
          for await (const chunk of s3Response.Body as AsyncIterable<Uint8Array>) chunks.push(chunk)
          const code = Buffer.concat(chunks).toString('utf-8')

          const testFilePath = join(GENERATED_DIR, `${test.id}.test.ts`)
          await writeFile(testFilePath, code, 'utf-8')

          // Run via Playwright CLI from the harness directory
          const result = await execa(
            'pnpm', ['exec', 'playwright', 'test', `generated/${test.id}.test.ts`, '--reporter=line'],
            {
              cwd: BROWSER_HARNESS_DIR,
              env: {
                ...process.env,
                ...credEnvMap,
                SPECLYN_RUN_ID: runId,
                SPECLYN_BASE_URL: baseUrl,
              },
              reject: false,
              timeout: 60_000,
            },
          )

          durationMs = Date.now() - stepStarted.getTime()
          stepStatus = result.exitCode === 0 ? 'passed' : 'failed'
          if (result.exitCode !== 0) {
            errorMessage = (result.stderr || result.stdout).slice(0, 1000)
          }

          await rm(testFilePath, { force: true })
        } catch (err) {
          durationMs = Date.now() - stepStarted.getTime()
          errorMessage = String(err).slice(0, 1000)
        }

        // ── HealerAgent: try to auto-fix selector failures before giving up ──
        if (stepStatus === 'failed' && errorMessage && isSelectorError(errorMessage) && test.codeSnapshot) {
          const healed = await tryHeal(projectId, test, errorMessage, baseUrl)
          if (healed) {
            // Retry once with the patched code
            try {
              const healedPath = join(GENERATED_DIR, `${test.id}-healed.test.ts`)
              await writeFile(healedPath, healed.code, 'utf-8')
              const retryResult = await execa(
                'pnpm', ['exec', 'playwright', 'test', `generated/${test.id}-healed.test.ts`, '--reporter=line'],
                {
                  cwd: BROWSER_HARNESS_DIR,
                  env: { ...process.env, ...credEnvMap, SPECLYN_RUN_ID: runId, SPECLYN_BASE_URL: baseUrl },
                  reject: false, timeout: 60_000,
                },
              )
              await rm(healedPath, { force: true })
              if (retryResult.exitCode === 0) {
                stepStatus = 'passed'
                errorMessage = null
                console.log(`[browser-runner] Healer fixed test ${test.id} ✓`)
                // Persist the healed code back to S3 + DB
                const healedKey = `projects/${projectId}/tests/${test.id}.test.ts`
                await s3.send(new PutObjectCommand({
                  Bucket: BUCKET, Key: healedKey, Body: healed.code, ContentType: 'text/plain',
                }))
                await db.update(generatedTests)
                  .set({
                    codeSnapshot: healed.code.slice(0, 2000),
                    qualityNotes: `[Auto-healed] ${healed.explanation} (confidence: ${healed.confidence.toFixed(2)})`,
                    isEdited: true,
                  })
                  .where(eq(generatedTests.id, test.id))
              }
            } catch { /* retry failed — keep original failure */ }
          }
        }

        if (stepStatus === 'passed') passed++; else failed++

        // Persist execution step
        const [step] = await db.insert(executionSteps).values({
          runId, testId: test.id, status: stepStatus,
          errorMessage, durationMs, startedAt: stepStarted, completedAt: new Date(),
        }).returning()

        // Upload any screenshots Playwright captured for this test
        if (step) {
          const screenshots = await findScreenshots(test.id)
          for (const screenshotPath of screenshots.slice(0, 3)) {
            try {
              const s3Key = await uploadScreenshot(screenshotPath, projectId, step.id)
              await db.insert(evidence).values({
                stepId: step.id, type: 'screenshot', storageUrl: s3Key, mimeType: 'image/png',
              })
              await rm(screenshotPath, { force: true })
            } catch { /* non-fatal */ }
          }
        }

        await emitEvent(projectId, runId, {
          type: stepStatus === 'passed' ? 'step_completed' : 'step_failed',
          testId: test.id, testName: test.name,
          status: stepStatus, durationMs, errorMessage,
        })
      }

      const coveragePercent = tests.length > 0 ? Math.round((passed / tests.length) * 100) : 0

      await db.update(executionRuns).set({
        status: failed === 0 ? 'passed' : 'failed',
        passed, failed, coveragePercent, completedAt: new Date(), lastHeartbeatAt: new Date(),
      }).where(eq(executionRuns.id, runId))

      await emitEvent(projectId, runId, {
        type: 'run_completed', runId, passed, failed, coveragePercent,
        status: failed === 0 ? 'passed' : 'failed',
      })

      await getReporterQueue().add('report', { projectId, runId, baseUrl } satisfies ClassifyFailuresPayload)

      console.log(`[browser-runner] Run ${runId} done — ${passed} passed, ${failed} failed`)
    } catch (err) {
      await db.update(executionRuns)
        .set({ status: 'error', failureReason: String(err).slice(0, 1000), completedAt: new Date() })
        .where(eq(executionRuns.id, runId))
      await emitEvent(projectId, runId, { type: 'run_status', status: 'error', message: String(err).slice(0, 200) })
      throw err
    }
  },
  { connection: getRedisConnection(), concurrency: 1 },
)

worker.on('completed', job => console.log(`[browser-runner] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[browser-runner] Job ${job?.id} failed:`, err.message))
console.log('[browser-runner] Worker started')
process.on('SIGTERM', async () => { await worker.close(); await publisher.quit(); process.exit(0) })
