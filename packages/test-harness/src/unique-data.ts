import { randomBytes } from 'crypto'

/**
 * Generates test-run-scoped unique values to avoid collisions between parallel runs.
 * Uses the run ID if available, otherwise a random suffix.
 */
const RUN_SUFFIX = (process.env['SPECLYN_RUN_ID'] ?? randomBytes(4).toString('hex')).slice(0, 8)

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}+${RUN_SUFFIX}@speclyn-test.invalid`
}

export function uniqueString(prefix = 'speclyn'): string {
  return `${prefix}-${RUN_SUFFIX}`
}

export function uniqueId(): string {
  return `${RUN_SUFFIX}-${randomBytes(4).toString('hex')}`
}
