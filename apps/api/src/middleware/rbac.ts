import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, orgMembers } from '@speclyn/db'
import type { AuthenticatedRequest } from './clerk-auth.js'

type Role = 'admin' | 'tester' | 'viewer'

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  tester: 1,
  admin: 2,
}

/**
 * Check if the user has at least the required role for the project.
 * Falls back to owner check if no organization is set on the project.
 */
export function requireRole(minRole: Role) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    if (!projectId) return

    const db = getDb()
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
    if (!project) { reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } }); return }

    // Owner always has admin access
    if (project.ownerId === userId) return

    // Check org membership if project has an org
    if (project.organizationId) {
      const [member] = await db.select().from(orgMembers)
        .where(and(
          eq(orgMembers.organizationId, project.organizationId),
          eq(orgMembers.userId, userId),
        ))

      if (member && ROLE_HIERARCHY[member.role as Role] >= ROLE_HIERARCHY[minRole]) return
    }

    reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: `Requires ${minRole} role` } })
  }
}
