import { Redis } from 'ioredis'

interface WorkerHandle {
  close: () => Promise<void>
}

/**
 * Shared worker bootstrap: graceful shutdown, heartbeats, error handlers.
 * Use in every worker's index.ts instead of ad-hoc process.on('SIGTERM').
 */
export function bootstrapWorker(opts: {
  name: string
  workers: WorkerHandle[]
  redisUrl?: string
}): void {
  const { name, workers } = opts
  const redisUrl = opts.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const heartbeatRedis = new Redis(redisUrl, { maxRetriesPerRequest: null })

  // Heartbeat: publish every 10s so health checks know the worker is alive
  const heartbeatKey = `speclyn:worker:${name}:heartbeat`
  const heartbeatInterval = setInterval(() => {
    void heartbeatRedis.set(heartbeatKey, String(Date.now()), 'EX', 30).catch(() => {})
  }, 10_000)

  // Initial heartbeat
  void heartbeatRedis.set(heartbeatKey, String(Date.now()), 'EX', 30).catch(() => {})

  let shuttingDown = false

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[${name}] ${signal} received, draining workers...`)

    clearInterval(heartbeatInterval)

    // Wait up to 30s for workers to drain
    const drainTimeout = setTimeout(() => {
      console.warn(`[${name}] Drain timeout, forcing exit`)
      process.exit(1)
    }, 30_000)

    try {
      await Promise.all(workers.map(w => w.close()))
      await heartbeatRedis.quit()
      clearTimeout(drainTimeout)
      console.log(`[${name}] All workers drained, exiting`)
      process.exit(0)
    } catch (err) {
      console.error(`[${name}] Error during shutdown:`, err)
      clearTimeout(drainTimeout)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('uncaughtException', (err) => {
    console.error(`[${name}] Uncaught exception:`, err)
    void shutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason) => {
    console.error(`[${name}] Unhandled rejection:`, reason)
    // Don't exit — log and continue. BullMQ handles job-level failures.
  })

  console.log(`[${name}] Worker started with heartbeat`)
}
