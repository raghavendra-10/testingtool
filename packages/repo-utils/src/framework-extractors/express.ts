import type { ExtractedRoute } from './index.js'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']
const ROUTE_REGEX = new RegExp(
  `(?:app|router|server)\\s*\\.\\s*(${HTTP_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
  'gi',
)

/**
 * Extract Express/Koa/Hono/NestJS-style routes from source code.
 * Matches patterns like: app.get('/path', ...), router.post('/path', ...)
 */
export function extractExpressRoutes(content: string, filePath: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = []
  let match: RegExpExecArray | null

  while ((match = ROUTE_REGEX.exec(content)) !== null) {
    const method = match[1]!.toUpperCase()
    const path = match[2]!

    routes.push({
      method,
      path,
      summary: '',
      source: 'ast',
      filePath,
    })
  }

  // Reset regex lastIndex
  ROUTE_REGEX.lastIndex = 0

  return routes
}
