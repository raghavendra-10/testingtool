import { resolve4, resolve6 } from 'dns/promises'

const PRIVATE_RANGES_V4 = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
]

const PRIVATE_RANGES_V6 = [
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80/i,
]

function isPrivateIp(ip: string): boolean {
  if (PRIVATE_RANGES_V4.some(r => r.test(ip))) return true
  if (PRIVATE_RANGES_V6.some(r => r.test(ip))) return true
  return false
}

/**
 * Validates that a URL is safe to fetch (no SSRF):
 * - Only http:// and https:// schemes
 * - Hostname does not resolve to private/internal IPs
 */
export async function validatePublicUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http:// and https:// URLs are allowed' }
  }

  const hostname = parsed.hostname

  // Check if hostname is a literal IP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isPrivateIp(hostname)) {
    return { valid: false, error: 'Private IP addresses are not allowed' }
  }

  // Resolve DNS and check all IPs
  try {
    const ips4 = await resolve4(hostname).catch(() => [] as string[])
    const ips6 = await resolve6(hostname).catch(() => [] as string[])
    const allIps = [...ips4, ...ips6]

    if (allIps.length === 0) {
      return { valid: false, error: 'Could not resolve hostname' }
    }

    for (const ip of allIps) {
      if (isPrivateIp(ip)) {
        return { valid: false, error: 'URL resolves to a private IP address' }
      }
    }
  } catch {
    return { valid: false, error: 'DNS resolution failed' }
  }

  return { valid: true }
}
