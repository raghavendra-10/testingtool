'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { Loader2, FileText } from 'lucide-react'

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
  pending:    { label: 'Queued',     color: 'bg-muted text-muted-foreground' },
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
  const color = mimeType.includes('pdf') ? 'text-red-500'
    : mimeType.includes('word') ? 'text-blue-500'
    : 'text-indigo-500'

  return <FileText className={`h-7 w-7 ${color}`} />
}

export function DocumentList({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  const { data: docs } = useQuery<Document[]>({
    queryKey: ['documents', projectId],
    queryFn: () => request<Document[]>(`/projects/${projectId}/documents`),
  })

  if (!docs || docs.length === 0) return null

  return (
    <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-white">
      {docs.map((doc) => {
        const cfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.pending
        return (
          <div key={doc.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
            <DocIcon mimeType={doc.mimeType} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(doc.sizeBytes)}</p>
            </div>
            <div className="flex items-center gap-3">
              {doc.status === 'done' && doc.requirementCount != null && (
                <span className="text-xs text-muted-foreground">{doc.requirementCount} reqs</span>
              )}
              {doc.status === 'processing' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
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
