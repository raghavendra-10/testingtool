import type { FastifyInstance } from 'fastify'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getDb, projects, executionRuns, executionSteps, generatedTests } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function trendRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/trends — coverage and pass rate over time
  app.get('/api/v1/projects/:projectId/trends', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    // Last 30 completed runs
    const runs = await db.select({
      id: executionRuns.id,
      status: executionRuns.status,
      totalTests: executionRuns.totalTests,
      passed: executionRuns.passed,
      failed: executionRuns.failed,
      coveragePercent: executionRuns.coveragePercent,
      completedAt: executionRuns.completedAt,
      createdAt: executionRuns.createdAt,
    }).from(executionRuns)
      .where(and(
        eq(executionRuns.projectId, projectId),
        sql`${executionRuns.status} IN ('passed', 'failed')`,
      ))
      .orderBy(desc(executionRuns.createdAt))
      .limit(30)

    const points = runs.reverse().map(r => ({
      runId: r.id,
      date: r.completedAt ?? r.createdAt,
      passRate: r.totalTests > 0 ? Math.round((r.passed / r.totalTests) * 100) : 0,
      coveragePercent: r.coveragePercent ?? 0,
      totalTests: r.totalTests,
      passed: r.passed,
      failed: r.failed,
    }))

    reply.send({ success: true, data: { points } })
  })

  // GET /api/v1/projects/:projectId/regressions — tests that previously passed but now fail
  app.get('/api/v1/projects/:projectId/regressions', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    // Get the last 2 completed runs
    const lastRuns = await db.select({ id: executionRuns.id }).from(executionRuns)
      .where(and(
        eq(executionRuns.projectId, projectId),
        sql`${executionRuns.status} IN ('passed', 'failed')`,
      ))
      .orderBy(desc(executionRuns.createdAt))
      .limit(2)

    if (lastRuns.length < 2) {
      return reply.send({ success: true, data: { regressions: [], flaky: [] } })
    }

    const [currentRun, previousRun] = lastRuns as [{ id: string }, { id: string }]

    // Get step results for both runs
    const currentSteps = await db.select({
      testId: executionSteps.testId,
      status: executionSteps.status,
    }).from(executionSteps).where(eq(executionSteps.runId, currentRun.id))

    const previousSteps = await db.select({
      testId: executionSteps.testId,
      status: executionSteps.status,
    }).from(executionSteps).where(eq(executionSteps.runId, previousRun.id))

    const prevMap = new Map(previousSteps.map(s => [s.testId, s.status]))

    // Regressions: passed before → failed now
    const regressionTestIds = currentSteps
      .filter(s => s.status === 'failed' && prevMap.get(s.testId) === 'passed')
      .map(s => s.testId)

    // Flaky: status changed between runs (either direction)
    const flakyTestIds = currentSteps
      .filter(s => {
        const prev = prevMap.get(s.testId)
        return prev !== undefined && prev !== s.status
      })
      .map(s => s.testId)

    // Fetch test names
    const regressions: Array<{ testId: string; testName: string }> = []
    const flaky: Array<{ testId: string; testName: string }> = []

    for (const testId of regressionTestIds) {
      const [test] = await db.select({ name: generatedTests.name }).from(generatedTests).where(eq(generatedTests.id, testId))
      if (test) regressions.push({ testId, testName: test.name })
    }

    for (const testId of flakyTestIds) {
      if (regressionTestIds.includes(testId)) continue // don't double-count
      const [test] = await db.select({ name: generatedTests.name }).from(generatedTests).where(eq(generatedTests.id, testId))
      if (test) flaky.push({ testId, testName: test.name })
    }

    reply.send({ success: true, data: { regressions, flaky } })
  })
}
