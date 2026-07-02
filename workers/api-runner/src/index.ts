import { Worker, Queue } from 'bullmq'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Redis } from 'ioredis'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { getDb, generatedTests, executionRuns, executionSteps, credentialReferences } from '@speclyn/db'
import { eq, inArray } from 'drizzle-orm'
import { decryptCredential } from '@speclyn/vault'
import { getRedisConnection } from '@speclyn/shared-types'
import type { ExecuteTestsJobPayload, ClassifyFailuresPayload } from '@speclyn/shared-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Path to packages/test-harness from workers/api-runner/src
const TEST_HARNESS_DIR = join(__dirname, '../../../packages/test-harness')
const GENERATED_DIR = join(TEST_HARNESS_DIR, 'generated')

const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})
const BUCKET = process.env['S3_BUCKET']!

const redisUrl = process.env['REDIS_URL']!
const publisher = new Redis(redisUrl)

function getReporterQueue(): Queue {
  return new Queue('generate-report', { connection: getRedisConnection() })
}

async function emitStepEvent(projectId: string, runId: string, event: object): Promise<void> {
  await publisher.publish(`project:${projectId}:run:${runId}`, JSON.stringify(event))
}

interface VitestResult {
  testResults: Array<{
    testFilePath: string
    testResults: Array<{
      fullName: string
      status: 'passed' | 'failed' | 'pending'
      duration?: number
      failureMessages: string[]
    }>
  }>
}

const worker = new Worker<ExecuteTestsJobPayload>(
  'execute-api',
  async (job) => {
    const { projectId, runId, testIds, baseUrl } = job.data
    const db = getDb()

    try {
    await db.update(executionRuns)
      .set({ status: 'running', startedAt: new Date(), lastHeartbeatAt: new Date() })
      .where(eq(executionRuns.id, runId))

    // Load tests
    const tests = await db.select().from(generatedTests)
      .where(inArray(generatedTests.id, testIds))

    // Resolve all credentials for this project (decrypt in-memory only)
    const creds = await db.select().from(credentialReferences)
      .where(eq(credentialReferences.projectId, projectId))

    const credEnvMap: Record<string, string> = {}
    for (const cred of creds) {
      try {
        const value = decryptCredential(cred.encryptedValue)
        credEnvMap[`SPECLYN_CRED_${cred.id.toUpperCase().replace(/-/g, '_')}`] = value
      } catch { /* skip bad creds */ }
    }

    await mkdir(GENERATED_DIR, { recursive: true })

    let passed = 0
    let failed = 0

    for (const test of tests) {
      if (!test.storageUrl) continue

      // Check if run was cancelled
      const [currentRun] = await db.select({ status: executionRuns.status }).from(executionRuns).where(eq(executionRuns.id, runId))
      if (currentRun?.status === 'cancelled') {
        console.log(`[api-runner] Run ${runId} cancelled by user, stopping`)
        return
      }

      // Heartbeat
      await db.update(executionRuns)
        .set({ lastHeartbeatAt: new Date() })
        .where(eq(executionRuns.id, runId))

      // Download test file from S3
      const s3Response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: test.storageUrl }))
      const chunks: Uint8Array[] = []
      for await (const chunk of s3Response.Body as AsyncIterable<Uint8Array>) chunks.push(chunk)
      const code = Buffer.concat(chunks).toString('utf-8')

      const testFilePath = join(GENERATED_DIR, `${test.id}.test.ts`)
      await writeFile(testFilePath, code, 'utf-8')

      // Emit step_started
      await emitStepEvent(projectId, runId, { type: 'step_started', testId: test.id, testName: test.name })

      const stepStarted = new Date()
      let stepStatus: 'passed' | 'failed' = 'failed'
      let errorMessage: string | null = null
      let durationMs = 0

      try {
        const result = await execa(
          'pnpm', ['exec', 'vitest', 'run', '--reporter=json', `generated/${test.id}.test.ts`],
          {
            cwd: TEST_HARNESS_DIR,
            env: {
              ...process.env,
              ...credEnvMap,
              SPECLYN_RUN_ID: runId,
              SPECLYN_BASE_URL: baseUrl,
            },
            reject: false,
          }
        )

        durationMs = Date.now() - stepStarted.getTime()

        // Parse vitest JSON output from stdout
        const jsonMatch = result.stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/)
        if (jsonMatch) {
          const vitestData = JSON.parse(jsonMatch[0]) as VitestResult
          const fileResult = vitestData.testResults[0]
          const allPassed = fileResult?.testResults.every(t => t.status === 'passed') ?? false
          stepStatus = allPassed ? 'passed' : 'failed'
          if (!allPassed) {
            const failedTest = fileResult?.testResults.find(t => t.status === 'failed')
            errorMessage = failedTest?.failureMessages.join('\n').slice(0, 1000) ?? 'Test failed'
          }
        } else {
          stepStatus = result.exitCode === 0 ? 'passed' : 'failed'
          if (result.exitCode !== 0) errorMessage = result.stderr.slice(0, 1000)
        }
      } catch (err) {
        durationMs = Date.now() - stepStarted.getTime()
        errorMessage = String(err).slice(0, 1000)
        stepStatus = 'failed'
      }

      if (stepStatus === 'passed') passed++ ; else failed++

      // Persist execution step
      const [step] = await db.insert(executionSteps).values({
        runId,
        testId: test.id,
        status: stepStatus,
        errorMessage,
        durationMs,
        startedAt: stepStarted,
        completedAt: new Date(),
      }).returning()

      // Emit step_completed
      await emitStepEvent(projectId, runId, {
        type: stepStatus === 'passed' ? 'step_completed' : 'step_failed',
        testId: test.id,
        testName: test.name,
        stepId: step?.id,
        status: stepStatus,
        durationMs,
        errorMessage,
      })

      // Cleanup temp file
      await rm(testFilePath, { force: true })
    }

    const coveragePercent = tests.length > 0 ? Math.round((passed / tests.length) * 100) : 0

    await db.update(executionRuns)
      .set({
        status: failed === 0 ? 'passed' : 'failed',
        passed, failed,
        coveragePercent,
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
      })
      .where(eq(executionRuns.id, runId))

    // Emit run_completed
    await emitStepEvent(projectId, runId, {
      type: 'run_completed',
      runId,
      passed,
      failed,
      coveragePercent,
      status: failed === 0 ? 'passed' : 'failed',
    })

    // Always enqueue reporter — computes coverage even when all tests pass
    await getReporterQueue().add('report', { projectId, runId, baseUrl } satisfies ClassifyFailuresPayload)

    console.log(`[api-runner] Run ${runId} done — ${passed} passed, ${failed} failed`)
    } catch (err) {
      await db.update(executionRuns)
        .set({ status: 'error', failureReason: String(err).slice(0, 1000), completedAt: new Date() })
        .where(eq(executionRuns.id, runId))
      await emitStepEvent(projectId, runId, { type: 'run_status', status: 'error', message: String(err).slice(0, 200) })
      throw err
    }
  },
  { connection: getRedisConnection(), concurrency: 2 },
)

worker.on('completed', job => console.log(`[api-runner] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[api-runner] Job ${job?.id} failed:`, err.message))
console.log('[api-runner] Worker started')
process.on('SIGTERM', async () => { await worker.close(); await publisher.quit(); process.exit(0) })
