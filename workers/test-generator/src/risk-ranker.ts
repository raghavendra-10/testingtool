/**
 * Rank endpoints by risk priority for test generation.
 * Higher priority = generated first under budget constraints.
 */

interface RankableEndpoint {
  id: string
  method: string
  path: string
  requestBody: string | null
}

interface RankedEndpoint extends RankableEndpoint {
  priority: number
  riskCategory: 'auth' | 'write' | 'delete' | 'parameterized_read' | 'simple_read'
}

const AUTH_PATTERNS = /login|auth|token|password|signup|register|session|oauth/i
const PAYMENT_PATTERNS = /payment|charge|billing|subscription|invoice|checkout/i

export function rankEndpointsByRisk(endpoints: RankableEndpoint[]): RankedEndpoint[] {
  return endpoints.map(ep => {
    let priority = 0
    let riskCategory: RankedEndpoint['riskCategory'] = 'simple_read'
    const method = ep.method.toUpperCase()

    // Auth endpoints: highest priority
    if (AUTH_PATTERNS.test(ep.path)) {
      priority += 100
      riskCategory = 'auth'
    }

    // Payment/billing endpoints: very high priority
    if (PAYMENT_PATTERNS.test(ep.path)) {
      priority += 90
    }

    // Write endpoints with request bodies
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      priority += 60
      if (riskCategory !== 'auth') riskCategory = 'write'
      if (ep.requestBody) priority += 10 // has defined schema — more to test
    }

    // Delete endpoints
    if (method === 'DELETE') {
      priority += 50
      if (riskCategory !== 'auth') riskCategory = 'delete'
    }

    // Parameterized GET (has :id or {id})
    if (method === 'GET' && (ep.path.includes(':') || ep.path.includes('{'))) {
      priority += 30
      if (riskCategory === 'simple_read') riskCategory = 'parameterized_read'
    }

    // Simple GET
    if (method === 'GET' && !ep.path.includes(':') && !ep.path.includes('{')) {
      priority += 10
    }

    return { ...ep, priority, riskCategory }
  }).sort((a, b) => b.priority - a.priority)
}
