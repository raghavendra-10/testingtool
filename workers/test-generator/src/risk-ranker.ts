/**
 * Rank endpoints by risk priority for test generation.
 * Higher priority = generated first under budget constraints.
 */

type RiskCategory = 'auth' | 'write' | 'delete' | 'parameterized_read' | 'simple_read'

const AUTH_PATTERNS = /login|auth|token|password|signup|register|session|oauth/i
const PAYMENT_PATTERNS = /payment|charge|billing|subscription|invoice|checkout/i

export function rankEndpointsByRisk<T extends { id: string; method: string; path: string; requestBody: string | null }>(
  endpoints: T[],
): Array<T & { priority: number; riskCategory: RiskCategory }> {
  return endpoints.map(ep => {
    let priority = 0
    let riskCategory: RiskCategory = 'simple_read'
    const method = ep.method.toUpperCase()

    if (AUTH_PATTERNS.test(ep.path)) {
      priority += 100
      riskCategory = 'auth'
    }

    if (PAYMENT_PATTERNS.test(ep.path)) {
      priority += 90
    }

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      priority += 60
      if (riskCategory !== 'auth') riskCategory = 'write'
      if (ep.requestBody) priority += 10
    }

    if (method === 'DELETE') {
      priority += 50
      if (riskCategory !== 'auth') riskCategory = 'delete'
    }

    if (method === 'GET' && (ep.path.includes(':') || ep.path.includes('{'))) {
      priority += 30
      if (riskCategory === 'simple_read') riskCategory = 'parameterized_read'
    }

    if (method === 'GET' && !ep.path.includes(':') && !ep.path.includes('{')) {
      priority += 10
    }

    return { ...ep, priority, riskCategory }
  }).sort((a, b) => b.priority - a.priority)
}
