import { Worker } from 'bullmq'
import { getDb, executionSteps, defects, coverageLinks, generatedTests, requirements, executionRuns } from '@speclyn/db'
import { eq, and } from 'drizzle-orm'
import { getRedisConnection, publishEvent, putMetric } from '@speclyn/shared-types'
import type { ClassifyFailuresPayload } from '@speclyn/shared-types'
import { FailureClassifierAgent, TestQualityAgent } from '@speclyn/agents'
import { endpoints } from '@speclyn/db'
import { fireOutboundWebhooks } from './fire-webhooks.js'

const classifierAgent = new FailureClassifierAgent()
const qualityAgent = new TestQualityAgent()

const worker = new Worker<ClassifyFailuresPayload>(
  'generate-report',
  async (job) => {
    const { projectId, runId } = job.data
    const db = getDb()

    try {
    // Load all failed steps for this run
    const failedSteps = await db.select().from(executionSteps)
      .where(and(eq(executionSteps.runId, runId), eq(executionSteps.status, 'failed')))

    console.log(`[reporter] Classifying ${failedSteps.length} failures for run ${runId}`)

    for (const step of failedSteps) {
      const errorMsg = step.errorMessage ?? 'Unknown error'

      // §1.1: Deterministic classification first, LLM only for ambiguous cases
      const deterministicCategory = FailureClassifierAgent.deterministicClassify(null, errorMsg)

      let title = errorMsg.slice(0, 100)
      let failureCategory = deterministicCategory ?? 'unknown'
      let aiClassification: string | null = null

      if (!deterministicCategory) {
        // Load test name for context
        const [test] = await db.select({ name: generatedTests.name })
          .from(generatedTests)
          .where(eq(generatedTests.id, step.testId))

        const result = await classifierAgent.run({
          projectId,
          stepId: step.id,
          testName: test?.name ?? 'unknown',
          errorMessage: errorMsg,
          errorType: step.errorType,
          httpStatus: null,
          responseBody: null,
        }, projectId)

        if (result.success && result.data) {
          failureCategory = result.data.failureCategory
          title = result.data.title
          aiClassification = result.data.explanation
        }
      }

      // Find linked requirement via coverage_links → generatedTests
      const [link] = await db.select({ requirementId: coverageLinks.requirementId })
        .from(coverageLinks)
        .where(eq(coverageLinks.testId, step.testId))

      await db.insert(defects).values({
        projectId,
        runId,
        stepId: step.id,
        requirementId: link?.requirementId ?? null,
        title,
        failureCategory,
        errorMessage: errorMsg.slice(0, 1000),
        aiClassification,
        status: 'open',
      })
    }

    // Compute coverage: requirements with at least one passing test
    const allReqs = await db.select({ id: requirements.id })
      .from(requirements)
      .where(eq(requirements.projectId, projectId))

    const passedSteps = await db.select({ testId: executionSteps.testId })
      .from(executionSteps)
      .where(and(eq(executionSteps.runId, runId), eq(executionSteps.status, 'passed')))

    const passedTestIds = new Set(passedSteps.map(s => s.testId))

    let coveredReqs = 0
    for (const req of allReqs) {
      const links = await db.select().from(coverageLinks).where(eq(coverageLinks.requirementId, req.id))
      if (links.some(l => passedTestIds.has(l.testId))) coveredReqs++
    }

    const coveragePercent = allReqs.length > 0
      ? Math.round((coveredReqs / allReqs.length) * 100)
      : 0

    await db.update(executionRuns)
      .set({ coveragePercent })
      .where(eq(executionRuns.id, runId))

    // Test quality scoring (non-fatal)
    try {
      const allSteps = await db.select({ testId: executionSteps.testId })
        .from(executionSteps)
        .where(eq(executionSteps.runId, runId))

      const testIds = [...new Set(allSteps.map(s => s.testId))]
      const testsToScore = await db.select().from(generatedTests)
        .where(and(eq(generatedTests.projectId, projectId)))

      let scored = 0
      for (const test of testsToScore) {
        if (!test.codeSnapshot || !testIds.includes(test.id)) continue
        if (test.qualityScore != null) continue // already scored

        const ep = test.endpointId
          ? (await db.select({ method: endpoints.method, path: endpoints.path }).from(endpoints).where(eq(endpoints.id, test.endpointId)))[0]
          : null

        const [link] = await db.select({ requirementId: coverageLinks.requirementId })
          .from(coverageLinks).where(eq(coverageLinks.testId, test.id))
        const reqTitle = link
          ? (await db.select({ title: requirements.title }).from(requirements).where(eq(requirements.id, link.requirementId)))[0]?.title
          : null

        const result = await qualityAgent.run({
          projectId,
          testCode: test.codeSnapshot,
          testName: test.name,
          requirementTitle: reqTitle ?? null,
          endpointMethod: ep?.method ?? 'GET',
          endpointPath: ep?.path ?? '/',
        }, projectId)

        if (result.success && result.data) {
          await db.update(generatedTests)
            .set({
              qualityScore: result.data.score,
              qualityNotes: `${result.data.reasoning}\n\nSuggestions:\n${result.data.suggestions.join('\n')}`,
            })
            .where(eq(generatedTests.id, test.id))
          scored++
        }
      }
      if (scored > 0) console.log(`[reporter] Scored ${scored} tests for quality`)
    } catch (err) {
      console.warn('[reporter] Quality scoring failed (non-fatal):', err)
    }

    // Fire outbound webhooks (non-fatal)
    const [completedRun] = await db.select({ passed: executionRuns.passed, failed: executionRuns.failed, status: executionRuns.status })
      .from(executionRuns).where(eq(executionRuns.id, runId))
    await fireOutboundWebhooks(projectId, 'run_completed', {
      runId,
      status: completedRun?.status ?? 'unknown',
      passed: completedRun?.passed ?? 0,
      failed: completedRun?.failed ?? 0,
      coveragePercent,
      defectsCreated: failedSteps.length,
    }).catch((err: unknown) => console.warn('[reporter] Webhook delivery error (non-fatal):', err))

    if (failedSteps.length > 0) {
      await fireOutboundWebhooks(projectId, 'defect_created', {
        runId, defectCount: failedSteps.length,
      }).catch((err: unknown) => console.warn('[reporter] Defect webhook error (non-fatal):', err))
    }

    if (coveragePercent !== undefined) {
      await fireOutboundWebhooks(projectId, 'coverage_changed', {
        runId, coveragePercent,
      }).catch((err: unknown) => console.warn('[reporter] Coverage webhook error (non-fatal):', err))
    }

    // Publish to EventBridge (non-fatal)
    void publishEvent('speclyn.reporter', 'RunCompleted', {
      projectId, runId,
      status: completedRun?.status ?? 'unknown',
      passed: completedRun?.passed ?? 0,
      failed: completedRun?.failed ?? 0,
      coveragePercent,
      defectsCreated: failedSteps.length,
    }).catch(() => {})

    if (failedSteps.length > 0) {
      void publishEvent('speclyn.reporter', 'DefectCreated', {
        projectId, runId, defectCount: failedSteps.length,
        severity: 'high',
      }).catch(() => {})
    }

    // Publish CloudWatch metrics (non-fatal)
    const totalTests = (completedRun?.passed ?? 0) + (completedRun?.failed ?? 0)
    const passRate = totalTests > 0 ? ((completedRun?.passed ?? 0) / totalTests) * 100 : 0
    void putMetric('Speclyn/Tests', 'TestsExecuted', totalTests, 'Count').catch(() => {})
    void putMetric('Speclyn/Tests', 'PassRate', passRate, 'Percent').catch(() => {})
    void putMetric('Speclyn/Tests', 'DefectsCreated', failedSteps.length, 'Count').catch(() => {})

    console.log(`[reporter] Done — ${failedSteps.length} defects, ${coveragePercent}% coverage`)
    } catch (err) {
      console.error(`[reporter] Error in run ${runId}:`, err)
      throw err
    }
  },
  { connection: getRedisConnection(), concurrency: 2 },
)

worker.on('completed', job => console.log(`[reporter] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[reporter] Job ${job?.id} failed:`, err.message))
console.log('[reporter] Worker started')
process.on('SIGTERM', async () => { await worker.close(); process.exit(0) })
