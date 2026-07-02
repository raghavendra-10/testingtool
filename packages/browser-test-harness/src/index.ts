import { decryptCredential } from '@speclyn/vault'

/**
 * Reads an encrypted credential injected as an env var by the browser-runner.
 * Env var name convention: SPECLYN_CRED_<ID_UPPER>
 */
export function getCredential(credId: string): string {
  const envKey = `SPECLYN_CRED_${credId.toUpperCase().replace(/-/g, '_')}`
  const encrypted = process.env[envKey]
  if (!encrypted) throw new Error(`Credential env var ${envKey} is not set`)
  return decryptCredential(encrypted)
}

/**
 * Returns the base URL for the current test run.
 */
export function getBaseUrl(): string {
  return process.env['SPECLYN_BASE_URL'] ?? 'http://localhost:3000'
}
