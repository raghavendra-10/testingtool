import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, generatedTests, defects, endpoints, requirements } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'

type ExportFormat = 'csv' | 'json'
type ExportResource = 'tests' | 'defects' | 'endpoints' | 'requirements'

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h]
        if (val == null) return ''
        const str = String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    ),
  ]
  return csvRows.join('\n')
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  app.get('/api/v1/projects/:projectId/export/:resource', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, resource } = req.params as { projectId: string; resource: string }
    const { format } = req.query as { format?: string }

    const exportFormat: ExportFormat = format === 'csv' ? 'csv' : 'json'
    const exportResource = resource as ExportResource

    const db = getDb()
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    let rows: Record<string, unknown>[] = []

    switch (exportResource) {
      case 'tests':
        rows = await db.select({
          id: generatedTests.id, name: generatedTests.name, testType: generatedTests.testType,
          status: generatedTests.status, qualityScore: generatedTests.qualityScore, createdAt: generatedTests.createdAt,
        }).from(generatedTests).where(eq(generatedTests.projectId, projectId))
        break
      case 'defects':
        rows = await db.select({
          id: defects.id, title: defects.title, failureCategory: defects.failureCategory,
          status: defects.status, errorMessage: defects.errorMessage, createdAt: defects.createdAt,
        }).from(defects).where(eq(defects.projectId, projectId))
        break
      case 'endpoints':
        rows = await db.select({
          id: endpoints.id, method: endpoints.method, path: endpoints.path,
          summary: endpoints.summary, source: endpoints.source, createdAt: endpoints.createdAt,
        }).from(endpoints).where(eq(endpoints.projectId, projectId))
        break
      case 'requirements':
        rows = await db.select({
          id: requirements.id, title: requirements.title, type: requirements.type,
          priority: requirements.priority, createdAt: requirements.createdAt,
        }).from(requirements).where(eq(requirements.projectId, projectId))
        break
      default:
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid resource. Use: tests, defects, endpoints, requirements' } })
    }

    const filename = `speclyn-${project.name}-${exportResource}.${exportFormat}`

    if (exportFormat === 'csv') {
      reply.header('Content-Type', 'text/csv')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(toCsv(rows))
    }

    reply.header('Content-Type', 'application/json')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(JSON.stringify(rows, null, 2))
  })
}
