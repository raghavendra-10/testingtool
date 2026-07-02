import type { FastifyInstance } from 'fastify'
import { eq, desc, sql } from 'drizzle-orm'
import { getDb, projects, executionRuns, defects, schedules } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // GET /api/v1/dashboard — global overview for the authenticated user
  app.get('/api/v1/dashboard', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const db = getDb()

    // Total projects
    const userProjects = await db.select({ id: projects.id, name: projects.name })
      .from(projects).where(eq(projects.ownerId, userId))

    const projectIds = userProjects.map(p => p.id)

    if (projectIds.length === 0) {
      return reply.send({
        success: true,
        data: { totalProjects: 0, recentRuns: [], overallPassRate: 0, activeSchedules: 0, recentDefects: [], projectSummaries: [] },
      })
    }

    // Recent runs across all projects (last 10)
    const recentRuns = await db.select({
      id: executionRuns.id,
      projectId: executionRuns.projectId,
      status: executionRuns.status,
      totalTests: executionRuns.totalTests,
      passed: executionRuns.passed,
      failed: executionRuns.failed,
      coveragePercent: executionRuns.coveragePercent,
      completedAt: executionRuns.completedAt,
      createdAt: executionRuns.createdAt,
    }).from(executionRuns)
      .where(sql`${executionRuns.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`,`)})`)
      .orderBy(desc(executionRuns.createdAt))
      .limit(10)

    // Overall pass rate from completed runs
    const completedRuns = recentRuns.filter(r => ['passed', 'failed'].includes(r.status))
    const totalPassed = completedRuns.reduce((sum, r) => sum + r.passed, 0)
    const totalTests = completedRuns.reduce((sum, r) => sum + r.totalTests, 0)
    const overallPassRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0

    // Active schedules count
    const activeSchedulesList = await db.select({ id: schedules.id })
      .from(schedules)
      .where(sql`${schedules.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`,`)}) AND ${schedules.enabled} = true`)

    // Recent defects (last 10)
    const recentDefects = await db.select({
      id: defects.id,
      projectId: defects.projectId,
      title: defects.title,
      failureCategory: defects.failureCategory,
      status: defects.status,
      createdAt: defects.createdAt,
    }).from(defects)
      .where(sql`${defects.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`,`)})`)
      .orderBy(desc(defects.createdAt))
      .limit(10)

    // Attach project names to runs and defects
    const projectMap = new Map(userProjects.map(p => [p.id, p.name]))

    reply.send({
      success: true,
      data: {
        totalProjects: projectIds.length,
        overallPassRate,
        activeSchedules: activeSchedulesList.length,
        recentRuns: recentRuns.map(r => ({ ...r, projectName: projectMap.get(r.projectId) ?? 'Unknown' })),
        recentDefects: recentDefects.map(d => ({ ...d, projectName: projectMap.get(d.projectId) ?? 'Unknown' })),
      },
    })
  })

  // GET /api/v1/activity — activity feed across all projects
  app.get('/api/v1/activity', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { limit: limitStr } = req.query as { limit?: string }
    const limit = Math.min(parseInt(limitStr ?? '30', 10), 50)
    const db = getDb()

    const userProjects = await db.select({ id: projects.id, name: projects.name })
      .from(projects).where(eq(projects.ownerId, userId))
    const projectIds = userProjects.map(p => p.id)

    if (projectIds.length === 0) {
      return reply.send({ success: true, data: [] })
    }

    const projectMap = new Map(userProjects.map(p => [p.id, p.name]))

    // Mix runs + defects as activity items, sorted by date
    const runs = await db.select({
      id: executionRuns.id,
      projectId: executionRuns.projectId,
      status: executionRuns.status,
      passed: executionRuns.passed,
      failed: executionRuns.failed,
      totalTests: executionRuns.totalTests,
      createdAt: executionRuns.createdAt,
    }).from(executionRuns)
      .where(sql`${executionRuns.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`,`)})`)
      .orderBy(desc(executionRuns.createdAt))
      .limit(limit)

    const recentDefects = await db.select({
      id: defects.id,
      projectId: defects.projectId,
      title: defects.title,
      createdAt: defects.createdAt,
    }).from(defects)
      .where(sql`${defects.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`,`)})`)
      .orderBy(desc(defects.createdAt))
      .limit(limit)

    type ActivityItem = { type: 'run' | 'defect'; projectName: string; createdAt: Date | string | null } & Record<string, unknown>

    const activity: ActivityItem[] = [
      ...runs.map(r => ({ type: 'run' as const, ...r, projectName: projectMap.get(r.projectId) ?? '' })),
      ...recentDefects.map(d => ({ type: 'defect' as const, ...d, projectName: projectMap.get(d.projectId) ?? '' })),
    ].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, limit)

    reply.send({ success: true, data: activity })
  })
}
