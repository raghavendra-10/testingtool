'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

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
  generating: 'text-amber-600', running: 'text-blue-600', pending: 'text-slate-400',
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
      {[1,2,3,4,5].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Activity</h1>
        <p className="text-sm text-slate-500">Recent events across all your projects</p>
      </div>

      {!items || items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">No activity yet. Start by creating a project and running tests.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {items.map((item, i) => (
            <a
              key={`${item.type}-${item.id}-${i}`}
              href={`/projects/${item.projectId}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              {item.type === 'run' ? (
                <svg className={`mt-0.5 shrink-0 ${STATUS_COLOR[item.status ?? 'pending']}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 3l8 4-8 4V3z" fill="currentColor" opacity="0.8"/>
                </svg>
              ) : (
                <svg className="mt-0.5 shrink-0 text-red-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v6M7 10v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
              <div className="min-w-0 flex-1">
                {item.type === 'run' ? (
                  <>
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{item.projectName}</span>
                      {' '}run {item.status === 'passed' ? 'passed' : item.status === 'failed' ? 'failed' : item.status ?? 'started'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.totalTests} tests · {item.passed} passed · {item.failed} failed
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-700">
                      New defect in <span className="font-medium">{item.projectName}</span>
                    </p>
                    <p className="text-xs text-slate-400 truncate">{item.title}</p>
                  </>
                )}
              </div>
              <span className="shrink-0 text-xs text-slate-400 mt-0.5">{timeAgo(item.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
