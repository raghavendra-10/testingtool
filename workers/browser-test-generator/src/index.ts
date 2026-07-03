import { Worker, Queue } from 'bullmq'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { chromium } from 'playwright'
import { getDb, requirements, generatedTests, executionRuns, credentialReferences } from '@speclyn/db'
import { eq } from 'drizzle-orm'
import { getRedisConnection, bootstrapWorker } from '@speclyn/shared-types'
import type { GenerateBrowserTestsJobPayload, ExecuteTestsJobPayload } from '@speclyn/shared-types'
import { UIExplorerAgent, BrowserTestAgent, AccessibilityTestAgent } from '@speclyn/agents'
import IORedis from 'ioredis'

const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})
const BUCKET = process.env['S3_BUCKET']!

const uiExplorer = new UIExplorerAgent()
const browserTestAgent = new BrowserTestAgent()
const accessibilityAgent = new AccessibilityTestAgent()

function getExecuteBrowserQueue(): Queue {
  return new Queue('execute-browser', { connection: getRedisConnection() })
}

function getSsePublisher(): IORedis {
  return new IORedis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })
}

async function emit(pub: IORedis, projectId: string, runId: string, event: object) {
  await pub.publish(`project:${projectId}:run:${runId}`, JSON.stringify(event))
}

const worker = new Worker<GenerateBrowserTestsJobPayload>(
  'generate-browser-tests',
  async (job) => {
    const { projectId, runId, pageUrls, ownerId, baseUrl } = job.data
    const db = getDb()
    const pub = getSsePublisher()

    try {
      await db.update(executionRuns)
        .set({ status: 'generating', startedAt: new Date(), lastHeartbeatAt: new Date() })
        .where(eq(executionRuns.id, runId))
      await emit(pub, projectId, runId, { type: 'run_status', status: 'generating' })

      // Fetch project requirements (used to drive test generation per page)
      const reqs = await db.select().from(requirements)
        .where(eq(requirements.projectId, projectId))

      // Fetch credential IDs for the project
      const creds = await db.select({ id: credentialReferences.id })
        .from(credentialReferences)
        .where(eq(credentialReferences.projectId, projectId))

      const generatedTestIds: string[] = []

      // Launch browser once to fetch all page HTMLs
      const browser = await chromium.launch({ headless: true })

      for (const pageUrl of pageUrls) {
        // Check for cancellation
        const [currentRun] = await db.select({ status: executionRuns.status })
          .from(executionRuns).where(eq(executionRuns.id, runId))
        if (currentRun?.status === 'cancelled') {
          console.log(`[browser-test-generator] Run ${runId} cancelled, stopping`)
          await browser.close()
          pub.disconnect()
          return
        }

        await db.update(executionRuns)
          .set({ lastHeartbeatAt: new Date() })
          .where(eq(executionRuns.id, runId))

        await emit(pub, projectId, runId, { type: 'step_started', testName: `Exploring ${pageUrl}` })

        // Fetch page HTML
        let pageHtml = ''
        try {
          const page = await browser.newPage()
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
          pageHtml = await page.content()
          await page.close()
        } catch (err) {
          console.warn(`[browser-test-generator] Failed to fetch ${pageUrl}:`, String(err).slice(0, 200))
          await emit(pub, projectId, runId, {
            type: 'step_failed', testName: `Exploring ${pageUrl}`,
            errorMessage: `Could not load page: ${String(err).slice(0, 200)}`,
          })
          continue
        }

        // Run UIExplorerAgent to build element inventory
        const exploreResult = await uiExplorer.run({ projectId, pageUrl, pageHtml }, projectId)
        if (!exploreResult.success || !exploreResult.data) {
          await emit(pub, projectId, runId, {
            type: 'step_failed', testName: `Exploring ${pageUrl}`,
            errorMessage: 'UI exploration failed',
          })
          continue
        }

        const { elements } = exploreResult.data
        await emit(pub, projectId, runId, {
          type: 'step_completed', testName: `Exploring ${pageUrl}`,
          status: 'passed', meta: `${elements.length} elements found`,
        })

        // Generate one browser test per requirement (cap at 5 per page to keep runs manageable)
        const targetReqs = reqs.slice(0, 5)
        for (const req of targetReqs) {
          const testName = `[Browser] ${req.title} — ${pageUrl}`
          await emit(pub, projectId, runId, { type: 'step_started', testName })

          // Create test record
          const [testRecord] = await db.insert(generatedTests).values({
            projectId,
            name: testName,
            testType: 'browser',
            dataLifecycle: 'read_only',
            status: 'draft',
          }).returning()
          if (!testRecord) continue

          const authType = creds.length > 0 ? 'bearer' : null

          const genResult = await browserTestAgent.run({
            projectId,
            testId: testRecord.id,
            pageUrl,
            requirement: { title: req.title, description: req.description },
            authType,
            elementInventory: elements.map(e => ({
              selector: e.selector,
              role: e.role,
              text: e.text,
            })),
          }, projectId)

          if (!genResult.success || !genResult.data) {
            console.warn(`[browser-test-generator] Code gen failed for test ${testRecord.id}`)
            await emit(pub, projectId, runId, { type: 'step_failed', testName, errorMessage: 'Code generation failed' })
            continue
          }

          const code = genResult.data.code
          const s3Key = `projects/${projectId}/tests/${testRecord.id}.test.ts`
          await s3.send(new PutObjectCommand({
            Bucket: BUCKET, Key: s3Key, Body: code, ContentType: 'text/plain',
          }))

          await db.update(generatedTests)
            .set({ status: 'active', storageUrl: s3Key, codeSnapshot: code.slice(0, 2000) })
            .where(eq(generatedTests.id, testRecord.id))

          generatedTestIds.push(testRecord.id)
          await emit(pub, projectId, runId, { type: 'step_completed', testName, status: 'passed' })
          console.log(`[browser-test-generator] Generated: ${testName}`)
        }

        // ── Accessibility test (one per page, WCAG 2.1 AA) ──────────────────
        const a11yTestName = `[A11y] ${pageUrl}`
        await emit(pub, projectId, runId, { type: 'step_started', testName: a11yTestName })
        try {
          const a11yResult = await accessibilityAgent.run({
            projectId,
            pageUrl,
            pageTitle: pageUrl.split('/').pop() || 'page',
            knownElements: elements.map(e => ({ selector: e.selector, role: e.role })),
          }, projectId)

          if (a11yResult.success && a11yResult.data) {
            const [a11yRecord] = await db.insert(generatedTests).values({
              projectId,
              name: a11yTestName,
              testType: 'browser',
              dataLifecycle: 'read_only',
              status: 'draft',
            }).returning()

            if (a11yRecord) {
              const a11yKey = `projects/${projectId}/tests/${a11yRecord.id}.test.ts`
              await s3.send(new PutObjectCommand({
                Bucket: BUCKET, Key: a11yKey, Body: a11yResult.data.code, ContentType: 'text/plain',
              }))
              await db.update(generatedTests)
                .set({
                  status: 'active',
                  storageUrl: a11yKey,
                  codeSnapshot: a11yResult.data.code.slice(0, 2000),
                  qualityNotes: `WCAG ${a11yResult.data.wcagLevel} checks: ${a11yResult.data.checksIncluded.join(', ')}`,
                })
                .where(eq(generatedTests.id, a11yRecord.id))
              generatedTestIds.push(a11yRecord.id)
              await emit(pub, projectId, runId, {
                type: 'step_completed', testName: a11yTestName, status: 'passed',
                meta: `WCAG ${a11yResult.data.wcagLevel}: ${a11yResult.data.checksIncluded.length} checks`,
              })
              console.log(`[browser-test-generator] A11y test generated for ${pageUrl}`)
            }
          } else {
            await emit(pub, projectId, runId, {
              type: 'step_failed', testName: a11yTestName, errorMessage: 'Accessibility agent failed',
            })
          }
        } catch (err) {
          console.warn(`[browser-test-generator] A11y generation failed for ${pageUrl} (non-fatal):`, String(err).slice(0, 150))
          await emit(pub, projectId, runId, {
            type: 'step_failed', testName: a11yTestName,
            errorMessage: `A11y error: ${String(err).slice(0, 100)}`,
          })
        }
      }

      await browser.close()

      await db.update(executionRuns)
        .set({ totalTests: generatedTestIds.length, lastHeartbeatAt: new Date() })
        .where(eq(executionRuns.id, runId))

      if (generatedTestIds.length === 0) {
        await db.update(executionRuns)
          .set({ status: 'failed', failureReason: 'No browser tests were generated', completedAt: new Date() })
          .where(eq(executionRuns.id, runId))
        await emit(pub, projectId, runId, { type: 'run_status', status: 'failed', message: 'No tests generated' })
        pub.disconnect()
        return
      }

      await emit(pub, projectId, runId, { type: 'run_status', status: 'running', totalTests: generatedTestIds.length })

      await getExecuteBrowserQueue().add('execute', {
        projectId, runId, environmentId: '', testIds: generatedTestIds,
        workerType: 'browser', ownerId, baseUrl,
      } satisfies ExecuteTestsJobPayload, { attempts: 1 })

      pub.disconnect()
      console.log(`[browser-test-generator] Done — ${generatedTestIds.length} tests queued for run ${runId}`)
    } catch (err) {
      await db.update(executionRuns)
        .set({ status: 'error', failureReason: String(err).slice(0, 1000), completedAt: new Date() })
        .where(eq(executionRuns.id, runId))
      await emit(pub, projectId, runId, { type: 'run_status', status: 'error', message: String(err).slice(0, 200) })
      pub.disconnect()
      throw err
    }
  },
  { connection: getRedisConnection(), concurrency: 1 },
)

worker.on('completed', job => console.log(`[browser-test-generator] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[browser-test-generator] Job ${job?.id} failed:`, err.message))
console.log('[browser-test-generator] Worker started')
bootstrapWorker({ name: 'browser-test-generator', workers: [worker] })
