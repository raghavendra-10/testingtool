import { Queue } from 'bullmq'
import { getDb, schedules, endpoints, environments, executionRuns, projects } from '@speclyn/db'
import { eq, and, lte, isNull } from 'drizzle-orm'
import { getRedisConnection, bootstrapWorker } from '@speclyn/shared-types'
import type { GenerateTestsJobPayload } from '@speclyn/shared-types'

const POLL_INTERVAL_MS = 30_000 // check every 30 seconds

function getGenerateQueue(): Queue {
  return new Queue('generate-tests', { connection: getRedisConnection() })
}

async function checkSchedules(): Promise<void> {
  const db = getDb()
  const now = new Date()

  // Find all enabled schedules where nextRunAt <= now
  const dueSchedules = await db.select().from(schedules)
    .where(and(
      eq(schedules.enabled, true),
      lte(schedules.nextRunAt, now),
    ))

  for (const schedule of dueSchedules) {
    console.log(`[scheduler] Triggering schedule "${schedule.name}" for project ${schedule.projectId}`)

    // Get endpoints
    const eps = await db.select({ id: endpoints.id }).from(endpoints)
      .where(eq(endpoints.projectId, schedule.projectId))

    if (eps.length === 0) {
      console.log(`[scheduler] No endpoints for project ${schedule.projectId}, skipping`)
      continue
    }

    // Resolve base URL: use the schedule's environment, then project default env, then env var
    let baseUrl = process.env['FALLBACK_BASE_URL'] ?? 'http://localhost:3000'
    if (schedule.environmentId) {
      const [env] = await db.select({ baseUrl: environments.baseUrl })
        .from(environments).where(eq(environments.id, schedule.environmentId))
      if (env?.baseUrl) baseUrl = env.baseUrl
    } else {
      const [defaultEnv] = await db.select({ baseUrl: environments.baseUrl })
        .from(environments)
        .where(and(eq(environments.projectId, schedule.projectId), eq(environments.isDefault, true)))
      if (defaultEnv?.baseUrl) baseUrl = defaultEnv.baseUrl
    }

    // Resolve ownerId from the project
    const [project] = await db.select({ ownerId: projects.ownerId })
      .from(projects).where(eq(projects.id, schedule.projectId))
    const ownerId = project?.ownerId ?? ''

    // Create run
    const [run] = await db.insert(executionRuns).values({
      projectId: schedule.projectId,
      environmentId: schedule.environmentId,
      status: 'pending',
    }).returning()

    if (!run) continue

    await getGenerateQueue().add('generate', {
      projectId: schedule.projectId,
      runId: run.id,
      endpointIds: eps.map(e => e.id),
      ownerId,
      baseUrl,
    } satisfies GenerateTestsJobPayload, { attempts: 1 })

    // Update schedule: set lastRunAt and compute nextRunAt
    const nextRunAt = new Date(now.getTime() + schedule.intervalHours * 3600_000)
    await db.update(schedules)
      .set({ lastRunAt: now, nextRunAt })
      .where(eq(schedules.id, schedule.id))

    console.log(`[scheduler] Run ${run.id} created, next run at ${nextRunAt.toISOString()}`)
  }
}

// Also initialize any schedules that have no nextRunAt set
async function initSchedules(): Promise<void> {
  const db = getDb()
  const uninitialized = await db.select().from(schedules)
    .where(and(eq(schedules.enabled, true), isNull(schedules.nextRunAt)))

  for (const s of uninitialized) {
    const nextRunAt = new Date(Date.now() + s.intervalHours * 3600_000)
    await db.update(schedules).set({ nextRunAt }).where(eq(schedules.id, s.id))
    console.log(`[scheduler] Initialized schedule "${s.name}" → next run at ${nextRunAt.toISOString()}`)
  }
}

// Main loop
console.log('[scheduler] Worker started')
await initSchedules()

const interval = setInterval(() => {
  void checkSchedules().catch((err: unknown) => console.error('[scheduler] Error:', err))
}, POLL_INTERVAL_MS)

// Run once immediately
void checkSchedules().catch((err: unknown) => console.error('[scheduler] Error:', err))

process.on('SIGTERM', () => {
  clearInterval(interval)
  console.log('[scheduler] Shutting down')
  process.exit(0)
})
