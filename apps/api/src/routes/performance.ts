import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, projects, endpoints, environments } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { PerformanceTestAgent } from '@speclyn/agents'

const perfAgent = new PerformanceTestAgent()

const GenerateK6Body = z.object({
  targetRps: z.number().int().min(1).max(10000).default(100),
  durationSeconds: z.number().int().min(10).max(3600).default(60),
  environmentId: z.string().uuid().optional(),
})

export async function performanceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/projects/:projectId/performance/k6
   * Generate a k6 load test script for all project endpoints.
   * Returns the script as plain text + JSON metadata.
   */
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof GenerateK6Body> }>(
    '/api/v1/projects/:projectId/performance/k6',
    { preHandler: clerkAuth },
    async (req, reply) => {
      const { projectId } = req.params
      const { targetRps, durationSeconds, environmentId } = GenerateK6Body.parse(req.body)
      const userId = (req as AuthenticatedRequest).userId
      const db = getDb()

      // Ownership check
      const [project] = await db.select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      // Resolve base URL from environment or default to localhost
      let baseUrl = 'http://localhost:3000'
      if (environmentId) {
        const [env] = await db.select({ baseUrl: environments.baseUrl })
          .from(environments)
          .where(eq(environments.id, environmentId))
        if (env?.baseUrl) baseUrl = env.baseUrl
      } else {
        const [defaultEnv] = await db.select({ baseUrl: environments.baseUrl })
          .from(environments)
          .where(eq(environments.projectId, projectId))
        if (defaultEnv?.baseUrl) baseUrl = defaultEnv.baseUrl
      }

      // Load all project endpoints
      const eps = await db.select({ method: endpoints.method, path: endpoints.path })
        .from(endpoints)
        .where(eq(endpoints.projectId, projectId))

      if (eps.length === 0) {
        return reply.code(422).send({ error: 'No endpoints found — connect a repository first' })
      }

      const result = await perfAgent.run({
        projectId,
        endpoints: eps,
        targetRps,
        durationSeconds,
      }, projectId)

      if (!result.success || !result.data) {
        return reply.code(500).send({ error: 'Failed to generate k6 script' })
      }

      const { script, thresholds, stages } = result.data

      // Inject the real base URL into the script
      const finalScript = script.replace(
        /const BASE_URL = .*?;/,
        `const BASE_URL = __ENV.BASE_URL || '${baseUrl}';`,
      )

      reply.send({
        script: finalScript,
        thresholds,
        stages,
        baseUrl,
        endpointCount: eps.length,
        usage: `k6 run --env BASE_URL=${baseUrl} script.k6.js`,
      })
    },
  )
}
