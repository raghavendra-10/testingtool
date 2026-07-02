'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { Radio } from 'lucide-react'

interface Endpoint {
  id: string
  method: string
  path: string
  summary: string | null
  source: string
  createdAt: string
}

const METHOD_COLOR: Record<string, string> = {
  GET:    'bg-emerald-50 text-emerald-700',
  POST:   'bg-blue-50 text-blue-700',
  PUT:    'bg-amber-50 text-amber-700',
  PATCH:  'bg-orange-50 text-orange-700',
  DELETE: 'bg-red-50 text-red-600',
}

const SOURCE_LABEL: Record<string, string> = {
  openapi: 'OpenAPI',
  postman: 'Postman',
  ast:     'AST',
}

export function EndpointList({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  const { data: eps, isLoading } = useQuery<Endpoint[]>({
    queryKey: ['endpoints', projectId],
    queryFn: () => request<Endpoint[]>(`/projects/${projectId}/endpoints`),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
    </div>
  )

  if (!eps || eps.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Radio className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No endpoints detected yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">Upload an OpenAPI or Postman spec to extract endpoints.</p>
    </div>
  )

  // Count methods for summary
  const methodCounts = eps.reduce<Record<string, number>>((acc, ep) => {
    acc[ep.method] = (acc[ep.method] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          Endpoints
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
            {eps.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {Object.entries(methodCounts).map(([method, count]) => (
            <span key={method} className={`rounded px-1.5 py-0.5 text-xs font-medium ${METHOD_COLOR[method] ?? 'bg-muted text-muted-foreground'}`}>
              {count} {method}
            </span>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-white">
        {eps.map((ep) => (
          <div key={ep.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${METHOD_COLOR[ep.method] ?? 'bg-muted text-muted-foreground'}`}>
              {ep.method}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm text-foreground">{ep.path}</p>
              {ep.summary && (
                <p className="truncate text-xs text-muted-foreground">{ep.summary}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {SOURCE_LABEL[ep.source] ?? ep.source}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
