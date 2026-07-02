import { decryptCredential } from '@speclyn/vault'

/**
 * Reads an encrypted credential injected as an env var by the agent runner.
 * Env var name convention: SPECLYN_CRED_<NAME_UPPER>
 * e.g., credential named "prod-api" → SPECLYN_CRED_PROD_API
 */
export function getCredential(name: string): string {
  const envKey = `SPECLYN_CRED_${name.toUpperCase().replace(/-/g, '_')}`
  const encrypted = process.env[envKey]
  if (!encrypted) throw new Error(`Credential env var ${envKey} is not set`)
  return decryptCredential(encrypted)
}

/**
 * Builds the Authorization header value for a given credential type.
 */
export function buildAuthHeader(type: string, value: string): Record<string, string> {
  switch (type) {
    case 'bearer':
      return { Authorization: `Bearer ${value}` }
    case 'api_key':
      return { 'X-API-Key': value }
    case 'basic_auth': {
      const encoded = Buffer.from(value).toString('base64')
      return { Authorization: `Basic ${encoded}` }
    }
    case 'custom_header': {
      // value format: "Header-Name: header-value"
      const colonIdx = value.indexOf(':')
      if (colonIdx === -1) throw new Error('custom_header value must be "Header-Name: value"')
      const headerName = value.slice(0, colonIdx).trim()
      const headerValue = value.slice(colonIdx + 1).trim()
      return { [headerName]: headerValue }
    }
    default:
      return {}
  }
}
