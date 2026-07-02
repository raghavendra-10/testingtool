import type { ExtractedRoute } from './index.js'

const DECORATOR_REGEX = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi

export function extractFastapiRoutes(content: string, filePath: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = []
  let match: RegExpExecArray | null

  while ((match = DECORATOR_REGEX.exec(content)) !== null) {
    routes.push({
      method: match[1]!.toUpperCase(),
      path: match[2]!,
      summary: '',
      source: 'ast',
      filePath,
    })
  }

  DECORATOR_REGEX.lastIndex = 0
  return routes
}
