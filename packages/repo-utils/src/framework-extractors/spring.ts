import type { ExtractedRoute } from './index.js'

const MAPPING_REGEX = /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/gi
const CLASS_MAPPING_REGEX = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/i

const METHOD_MAP: Record<string, string> = {
  GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT',
  PatchMapping: 'PATCH', DeleteMapping: 'DELETE', RequestMapping: 'GET',
}

export function extractSpringRoutes(content: string, filePath: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = []

  // Find class-level @RequestMapping for prefix
  const classMatch = content.match(CLASS_MAPPING_REGEX)
  const prefix = classMatch?.[1] ?? ''

  let match: RegExpExecArray | null
  while ((match = MAPPING_REGEX.exec(content)) !== null) {
    const annotation = match[1]!
    const path = match[2]!
    const method = METHOD_MAP[annotation] ?? 'GET'

    routes.push({
      method,
      path: prefix + path,
      summary: '',
      source: 'ast',
      filePath,
    })
  }

  MAPPING_REGEX.lastIndex = 0
  return routes
}
