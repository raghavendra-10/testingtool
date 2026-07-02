'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { AlertCircle } from 'lucide-react'

interface Defect {
  id: string
  title: string
  failureCategory: string | null
  errorMessage: string | null
  aiClassification: string | null
  status: string
  createdAt: string
}

const CATEGORY_COLOR: Record<string, string> = {
  auth_error:         'bg-red-50 text-red-600',
  server_error:       'bg-red-50 text-red-700',
  not_found:          'bg-amber-50 text-amber-600',
  assertion_failure:  'bg-orange-50 text-orange-600',
  schema_mismatch:    'bg-purple-50 text-purple-600',
  network_error:      'bg-muted text-muted-foreground',
  timeout:            'bg-muted text-muted-foreground',
  missing_field:      'bg-orange-50 text-orange-600',
  unexpected_status:  'bg-amber-50 text-amber-600',
  unknown:            'bg-muted text-muted-foreground',
}

const STATUS_COLOR: Record<string, string> = {
  open:     'bg-red-50 text-red-600',
  resolved: 'bg-green-50 text-green-600',
  ignored:  'bg-muted text-muted-foreground',
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function DefectList({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  const { data: defects, isLoading } = useQuery<Defect[]>({
    queryKey: ['defects', projectId],
    queryFn: () => request<Defect[]>(`/projects/${projectId}/defects`),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted"/>)}
    </div>
  )

  if (!defects || defects.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No defects found.</p>
      <p className="mt-1 text-xs text-muted-foreground">All tests passing — or no tests run yet.</p>
    </div>
  )

  const open = defects.filter(d => d.status === 'open').length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <p className="text-xs text-muted-foreground">Open defects</p>
          <p className="text-xl font-semibold text-red-600">{open}</p>
        </div>
        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-semibold text-foreground">{defects.length}</p>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-border rounded-xl border border-border bg-white">
        {defects.map((defect) => (
          <div key={defect.id} className="px-4 py-3 transition-colors hover:bg-muted/50">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{defect.title}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                {defect.failureCategory && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLOR[defect.failureCategory] ?? CATEGORY_COLOR['unknown']!}`}>
                    {defect.failureCategory.replace(/_/g, ' ')}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[defect.status] ?? STATUS_COLOR['open']!}`}>
                  {defect.status}
                </span>
              </div>
            </div>
            {defect.errorMessage && (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{defect.errorMessage}</p>
            )}
            {defect.aiClassification && (
              <p className="mt-1 text-xs text-muted-foreground">{defect.aiClassification}</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {formatRelative(defect.createdAt)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
