'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface AuditEntry {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string | null
  ipAddress: string | null
  createdAt: string
}

const ACTION_COLOR: Record<string, string> = {
  create: 'bg-green-50 text-green-600',
  delete: 'bg-red-50 text-red-600',
  update: 'bg-blue-50 text-blue-600',
  run: 'bg-indigo-50 text-indigo-600',
  revoke: 'bg-amber-50 text-amber-600',
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

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLOR)) {
    if (action.startsWith(key)) return color
  }
  return 'bg-slate-100 text-slate-500'
}

export function AuditLog({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  const { data, isLoading } = useQuery<{ logs: AuditEntry[]; total: number }>({
    queryKey: ['audit-logs', projectId],
    queryFn: () => request<{ logs: AuditEntry[]; total: number }>(`/projects/${projectId}/audit-logs`),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3,4].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-slate-700">Audit Log</h2>
        <p className="text-xs text-slate-400">{data?.total ?? 0} total events</p>
      </div>

      {!data || data.logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-xs text-slate-400">No audit events recorded yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {data.logs.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getActionColor(entry.action)}`}>
                {entry.action}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700">{entry.resourceType}{entry.resourceId ? ` #${entry.resourceId.slice(0, 8)}` : ''}</p>
                <p className="text-xs text-slate-400">by {entry.userId.slice(0, 12)}...{entry.ipAddress ? ` from ${entry.ipAddress}` : ''}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400" title={new Date(entry.createdAt).toLocaleString()}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
