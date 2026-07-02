import type { FastifyInstance } from 'fastify'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getDb, projects, requirements, coverageLinks, executionSteps, executionRuns, generatedTests } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function coverageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/projects/:projectId/coverage — coverage matrix for latest run
  app.get('/api/v1/projects/:projectId/coverage', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const reqs = await db.select().from(requirements)
      .where(eq(requirements.projectId, projectId))

    // Get all tests + their latest step status for this project
    const tests = await db.select().from(generatedTests)
      .where(eq(generatedTests.projectId, projectId))

    // Filter links to this project's tests only
    const projectTestIds = tests.map(t => t.id)
    const allLinks = projectTestIds.length > 0
      ? await db.select().from(coverageLinks).where(sql`${coverageLinks.testId} IN (${sql.join(projectTestIds.map(id => sql`${id}`), sql`,`)})`)
      : []

    // Get latest run
    const [latestRun] = await db.select().from(executionRuns)
      .where(eq(executionRuns.projectId, projectId))
      .orderBy(desc(executionRuns.createdAt))
      .limit(1)

    const stepStatusByTestId = new Map<string, string>()
    if (latestRun) {
      const steps = await db.select().from(executionSteps)
        .where(eq(executionSteps.runId, latestRun.id))
      for (const s of steps) stepStatusByTestId.set(s.testId, s.status)
    }

    // Build coverage matrix
    const matrix = reqs.map(req => {
      const linkedTestIds = allLinks
        .filter(l => l.requirementId === req.id)
        .map(l => l.testId)

      const linkedTests = tests.filter(t => linkedTestIds.includes(t.id))

      let status: 'covered' | 'failing' | 'not_tested' | 'no_tests'
      if (linkedTests.length === 0) {
        status = 'no_tests'
      } else {
        const statuses = linkedTests.map(t => stepStatusByTestId.get(t.id))
        if (statuses.every(s => s === undefined)) status = 'not_tested'
        else if (statuses.some(s => s === 'passed')) status = 'covered'
        else status = 'failing'
      }

      return {
        requirement: { id: req.id, title: req.title, type: req.type, priority: req.priority, module: req.module },
        status,
        testCount: linkedTests.length,
        passedCount: linkedTests.filter(t => stepStatusByTestId.get(t.id) === 'passed').length,
      }
    })

    const summary = {
      total: reqs.length,
      covered: matrix.filter(m => m.status === 'covered').length,
      failing: matrix.filter(m => m.status === 'failing').length,
      notTested: matrix.filter(m => m.status === 'not_tested').length,
      noTests: matrix.filter(m => m.status === 'no_tests').length,
      coveragePercent: reqs.length > 0
        ? Math.round((matrix.filter(m => m.status === 'covered').length / reqs.length) * 100)
        : 0,
    }

    reply.send({ success: true, data: { summary, matrix, latestRun } })
  })

  // GET /api/v1/projects/:projectId/gaps — requirements with no test coverage
  app.get('/api/v1/projects/:projectId/gaps', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const allReqs = await db.select().from(requirements)
      .where(eq(requirements.projectId, projectId))

    const projectTests = await db.select({ id: generatedTests.id }).from(generatedTests)
      .where(eq(generatedTests.projectId, projectId))
    const ptIds = projectTests.map(t => t.id)
    const allLinks = ptIds.length > 0
      ? await db.select().from(coverageLinks).where(sql`${coverageLinks.testId} IN (${sql.join(ptIds.map(id => sql`${id}`), sql`,`)})`)
      : []

    const linkedReqIds = new Set(allLinks.map(l => l.requirementId))
    const gaps = allReqs.filter(r => !linkedReqIds.has(r.id))

    reply.send({
      success: true,
      data: {
        total: allReqs.length,
        gapCount: gaps.length,
        gaps: gaps.map(r => ({
          id: r.id,
          title: r.title,
          description: r.description,
          type: r.type,
          priority: r.priority,
          module: r.module,
        })),
      },
    })
  })
}
