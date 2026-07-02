/**
 * Combined worker — runs ALL Speclyn workers in a single process.
 * Used in cost-optimized deployments (1 Fargate task instead of 9).
 *
 * Each worker is imported dynamically so a crash in one doesn't kill the rest.
 */

const WORKERS = [
  { name: 'doc-parser', path: '../../doc-parser/src/index.js' },
  { name: 'repo-analyzer', path: '../../repo-analyzer/src/index.js' },
  { name: 'test-generator', path: '../../test-generator/src/index.js' },
  { name: 'api-runner', path: '../../api-runner/src/index.js' },
  { name: 'reporter', path: '../../reporter/src/index.js' },
  { name: 'scheduler', path: '../../scheduler/src/index.js' },
  { name: 'code-analyzer', path: '../../code-analyzer/src/index.js' },
  { name: 'browser-test-generator', path: '../../browser-test-generator/src/index.js' },
  { name: 'browser-runner', path: '../../browser-runner/src/index.js' },
]

async function main() {
  console.log('[combined] Starting all workers in a single process...')

  for (const worker of WORKERS) {
    try {
      await import(worker.path)
      console.log(`[combined] ✓ ${worker.name} started`)
    } catch (err) {
      console.error(`[combined] ✗ ${worker.name} failed to start:`, String(err).slice(0, 200))
      // Don't exit — other workers can still function
    }
  }

  console.log(`[combined] All workers loaded. PID ${process.pid}`)
}

main().catch((err) => {
  console.error('[combined] Fatal error:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[combined] SIGTERM received, shutting down...')
  // Individual workers register their own SIGTERM handlers
  setTimeout(() => process.exit(0), 5000)
})
