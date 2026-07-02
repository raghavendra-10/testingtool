import { extractExpressRoutes } from './express.js'
import { extractNextjsRoutes } from './nextjs.js'
import { extractFastifyRoutes } from './fastify.js'
import { extractSpringRoutes } from './spring.js'
import { extractFastapiRoutes } from './fastapi.js'

export interface ExtractedRoute {
  method: string
  path: string
  summary: string
  source: string
  filePath: string
}

type ExtractorFn = (content: string, filePath: string) => ExtractedRoute[]

const EXTRACTORS: Record<string, ExtractorFn> = {
  express: extractExpressRoutes,
  nextjs: extractNextjsRoutes,
  fastify: extractFastifyRoutes,
  nestjs: extractExpressRoutes, // NestJS uses similar decorator patterns
  koa: extractExpressRoutes,    // Similar .get/.post patterns
  hono: extractExpressRoutes,   // Similar .get/.post patterns
  spring: extractSpringRoutes,
  fastapi: extractFastapiRoutes,
  django: extractFastapiRoutes, // Similar decorator patterns
}

/**
 * Extract routes from a source file using framework-specific logic.
 * Falls back to generic regex extraction for unknown frameworks.
 */
export function extractRoutes(content: string, filePath: string, framework: string | null): ExtractedRoute[] {
  const extractor = framework ? EXTRACTORS[framework] : undefined
  if (extractor) {
    try {
      return extractor(content, filePath)
    } catch {
      return []
    }
  }
  // Generic fallback: try all extractors, return first non-empty
  for (const fn of Object.values(EXTRACTORS)) {
    try {
      const routes = fn(content, filePath)
      if (routes.length > 0) return routes
    } catch {
      continue
    }
  }
  return []
}
