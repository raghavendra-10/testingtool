import { getDb, auditLogs } from '@speclyn/db'

export async function logAudit(opts: {
  projectId?: string | null
  userId: string
  action: string
  resourceType: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}): Promise<void> {
  try {
    await getDb().insert(auditLogs).values({
      projectId: opts.projectId ?? null,
      userId: opts.userId,
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId ?? null,
      metadata: opts.metadata ?? null,
      ipAddress: opts.ipAddress ?? null,
    })
  } catch {
    // Non-fatal — never fail a request because of audit logging
  }
}
