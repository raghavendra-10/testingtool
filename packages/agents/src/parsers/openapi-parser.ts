/**
 * Deterministic OpenAPI 3.0 parser.
 * No LLM — pure structural extraction per §1.1 Hybrid Intelligence Rule.
 */
import yaml from 'js-yaml'

export interface ParsedEndpoint {
  method: string
  path: string
  summary: string
  requestBody: string | null  // JSON-serialised schema or null
  responses: string | null    // JSON-serialised response map or null
  tags: string[]
}

interface OpenApiDoc {
  openapi?: string
  swagger?: string
  paths?: Record<string, Record<string, {
    summary?: string
    description?: string
    tags?: string[]
    requestBody?: unknown
    responses?: unknown
  }>>
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

export function isOpenApiSpec(content: string): boolean {
  try {
    const doc = yaml.load(content) as Record<string, unknown>
    return typeof doc === 'object' && doc !== null &&
      ('openapi' in doc || 'swagger' in doc) &&
      'paths' in doc
  } catch {
    return false
  }
}

export function parseOpenApi(content: string): ParsedEndpoint[] {
  const doc = yaml.load(content) as OpenApiDoc
  const endpoints: ParsedEndpoint[] = []

  if (!doc.paths) return endpoints

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue

      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? operation.description ?? '',
        requestBody: operation.requestBody ? JSON.stringify(operation.requestBody) : null,
        responses:   operation.responses   ? JSON.stringify(operation.responses)   : null,
        tags: operation.tags ?? [],
      })
    }
  }

  return endpoints
}
