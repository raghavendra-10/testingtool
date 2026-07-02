/**
 * Deterministic Postman Collection v2.1 parser.
 * No LLM — pure structural extraction per §1.1 Hybrid Intelligence Rule.
 */

export interface ParsedEndpoint {
  method: string
  path: string
  summary: string
  requestBody: string | null
  responses: string | null
  tags: string[]
}

interface PostmanItem {
  name?: string
  request?: {
    method?: string
    url?: { raw?: string; path?: string[] } | string
    body?: { raw?: string; mode?: string }
  }
  item?: PostmanItem[]  // folder
  response?: unknown[]
}

interface PostmanCollection {
  info?: { schema?: string; name?: string }
  item?: PostmanItem[]
}

export function isPostmanCollection(content: string): boolean {
  try {
    const doc = JSON.parse(content) as Record<string, unknown>
    const schema = (doc.info as Record<string, unknown> | undefined)?.schema
    return typeof schema === 'string' && schema.includes('postman')
  } catch {
    return false
  }
}

function extractPath(url: PostmanItem['request'] extends undefined ? never : NonNullable<PostmanItem['request']>['url']): string {
  if (!url) return '/'
  if (typeof url === 'string') {
    try { return new URL(url).pathname } catch { return url.split('?')[0] ?? url }
  }
  if (url.path) return '/' + url.path.join('/')
  if (url.raw) {
    try { return new URL(url.raw).pathname } catch { return url.raw.split('?')[0] ?? url.raw }
  }
  return '/'
}

function flattenItems(items: PostmanItem[], folderTag?: string): ParsedEndpoint[] {
  const results: ParsedEndpoint[] = []
  for (const item of items) {
    if (item.item) {
      // Folder — recurse with folder name as tag
      results.push(...flattenItems(item.item, item.name))
      continue
    }
    if (!item.request) continue
    const method = (item.request.method ?? 'GET').toUpperCase()
    const path = extractPath(item.request.url)
    const requestBody = item.request.body?.raw ?? null
    results.push({
      method,
      path,
      summary: item.name ?? '',
      requestBody: requestBody ? JSON.stringify({ raw: requestBody }) : null,
      responses: item.response ? JSON.stringify(item.response) : null,
      tags: folderTag ? [folderTag] : [],
    })
  }
  return results
}

export function parsePostman(content: string): ParsedEndpoint[] {
  const col = JSON.parse(content) as PostmanCollection
  if (!col.item) return []
  return flattenItems(col.item)
}
