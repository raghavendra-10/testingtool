import type { ExtractedRoute } from './index.js'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']
const ROUTE_REGEX = new RegExp(
  `(?:app|fastify|server|instance)\\s*\\.\\s*(${HTTP_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
  'gi',
)

export function extractFastifyRoutes(content: string, filePath: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = []
  let match: RegExpExecArray | null

  while ((match = ROUTE_REGEX.exec(content)) !== null) {
    routes.push({
      method: match[1]!.toUpperCase(),
      path: match[2]!,
      summary: '',
      source: 'ast',
      filePath,
    })
  }

  ROUTE_REGEX.lastIndex = 0
  return routes
}
