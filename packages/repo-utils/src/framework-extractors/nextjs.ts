import type { ExtractedRoute } from './index.js'

/**
 * Extract Next.js App Router routes from file paths.
 * Convention: app/api/users/route.ts → GET/POST /api/users
 */
export function extractNextjsRoutes(content: string, filePath: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = []

  // Only process route.ts/route.js files
  if (!filePath.match(/route\.(ts|js)$/)) return routes

  // Extract path from file path: app/api/users/route.ts → /api/users
  const match = filePath.match(/app\/(.+)\/route\.(ts|js)$/)
  if (!match) return routes

  const routePath = '/' + match[1]!
    .replace(/\[([^\]]+)\]/g, ':$1')  // [id] → :id
    .replace(/\(([^)]+)\)\//g, '')     // (group)/ → removed

  // Detect exported HTTP methods
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  for (const method of methods) {
    if (content.includes(`export async function ${method}`) || content.includes(`export function ${method}`)) {
      routes.push({ method, path: routePath, summary: '', source: 'ast', filePath })
    }
  }

  return routes
}
