'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface Document {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  status: 'pending' | 'processing' | 'done' | 'error'
  requirementCount: number | null
  createdAt: string
}

const STATUS_CONFIG = {
  pending:    { label: 'Queued',     color: 'bg-slate-100 text-slate-500' },
  processing: { label: 'Processing', color: 'bg-amber-50 text-amber-600' },
  done:       { label: 'Done',       color: 'bg-green-50 text-green-600' },
  error:      { label: 'Error',      color: 'bg-red-50 text-red-500' },
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function DocIcon({ mimeType }: { mimeType: string }) {
  const color = mimeType.includes('pdf') ? '#ef4444'
    : mimeType.includes('word') ? '#3b82f6'
    : '#6366f1'

  return (
    <svg width="28" height="32" viewBox="0 0 28 32" fill="none">
      <path d="M4 0h14l10 10v18a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill={color} opacity="0.12" />
      <path d="M18 0l10 10H22a4 4 0 0 1-4-4V0z" fill={color} opacity="0.3" />
      <text x="4" y="24" fontSize="7" fontWeight="700" fill={color} fontFamily="system-ui">
        {mimeType.includes('pdf') ? 'PDF' : mimeType.includes('word') ? 'DOC' : mimeType.includes('yaml') ? 'YML' : 'JSON'}
      </text>
    </svg>
  )
}

export function DocumentList({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  const { data: docs } = useQuery<Document[]>({
    queryKey: ['documents', projectId],
    queryFn: () => request<Document[]>(`/projects/${projectId}/documents`),
  })

  if (!docs || docs.length === 0) return null

  return (
    <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {docs.map((doc) => {
        const cfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.pending
        return (
          <div key={doc.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
            <DocIcon mimeType={doc.mimeType} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{doc.filename}</p>
              <p className="text-xs text-slate-400">{formatBytes(doc.sizeBytes)}</p>
            </div>
            <div className="flex items-center gap-3">
              {doc.status === 'done' && doc.requirementCount != null && (
                <span className="text-xs text-slate-400">{doc.requirementCount} reqs</span>
              )}
              {doc.status === 'processing' && (
                <svg className="animate-spin text-amber-500" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                  <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
