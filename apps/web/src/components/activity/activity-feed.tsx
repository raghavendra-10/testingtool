'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { Play, AlertCircle } from 'lucide-react'

interface ActivityItem {
  type: 'run' | 'defect'
  id: string
  projectId: string
  projectName: string
  createdAt: string
  // run fields
  status?: string
  passed?: number
  failed?: number
  totalTests?: number
  // defect fields
  title?: string
}

const STATUS_COLOR: Record<string, string> = {
  passed: 'text-green-600', failed: 'text-red-600', error: 'text-red-600',
  generating: 'text-amber-600', running: 'text-blue-600', pending: 'text-muted-foreground',
}

function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ActivityFeed() {
  const { request } = useApiClient()

  const { data: items, isLoading } = useQuery<ActivityItem[]>({
    queryKey: ['activity'],
    queryFn: () => request<ActivityItem[]>('/activity'),
    refetchInterval: 30000,
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3,4,5].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground">Recent events across all your projects</p>
      </div>

      {!items || items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No activity yet. Start by creating a project and running tests.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-white">
          {items.map((item, i) => (
            <a
              key={`${item.type}-${item.id}-${i}`}
              href={`/projects/${item.projectId}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              {item.type === 'run' ? (
                <Play className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[item.status ?? 'pending']}`} />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              <div className="min-w-0 flex-1">
                {item.type === 'run' ? (
                  <>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{item.projectName}</span>
                      {' '}run {item.status === 'passed' ? 'passed' : item.status === 'failed' ? 'failed' : item.status ?? 'started'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.totalTests} tests · {item.passed} passed · {item.failed} failed
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-foreground">
                      New defect in <span className="font-medium">{item.projectName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{item.title}</p>
                  </>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground mt-0.5">{timeAgo(item.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
