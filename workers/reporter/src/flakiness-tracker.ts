import { getDb, generatedTests, executionSteps } from '@speclyn/db'
import { eq, and, desc } from 'drizzle-orm'

/**
 * Update flakiness scores for tests in a run.
 * Flakiness = ratio of status flips (pass→fail or fail→pass) over recent runs.
 * Auto-quarantine tests with flakiness > 0.3.
 */
export async function updateFlakinessScores(projectId: string, runId: string): Promise<void> {
  const db = getDb()

  // Get all steps from this run
  const steps = await db.select({ testId: executionSteps.testId, status: executionSteps.status })
    .from(executionSteps)
    .where(eq(executionSteps.runId, runId))

  const testIds = [...new Set(steps.map(s => s.testId))]

  for (const testId of testIds) {
    // Get last 10 results for this test across all runs
    const history = await db.select({ status: executionSteps.status })
      .from(executionSteps)
      .where(eq(executionSteps.testId, testId))
      .orderBy(desc(executionSteps.createdAt))
      .limit(10)

    if (history.length < 3) continue // not enough data

    // Count status flips
    let flips = 0
    for (let i = 1; i < history.length; i++) {
      if (history[i]!.status !== history[i - 1]!.status) flips++
    }

    const flakinessScore = flips / (history.length - 1)
    const isQuarantined = flakinessScore > 0.3

    await db.update(generatedTests)
      .set({
        flakinessScore,
        isQuarantined,
      })
      .where(eq(generatedTests.id, testId))

    if (isQuarantined) {
      console.log(`[flakiness] Quarantined test ${testId} (flakiness: ${(flakinessScore * 100).toFixed(0)}%)`)
    }
  }
}
