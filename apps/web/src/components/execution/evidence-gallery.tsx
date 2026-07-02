'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface EvidenceItem {
  id: string
  stepId: string
  type: string
  storageUrl: string
  mimeType: string
  capturedAt: string
  downloadUrl: string
}

export function EvidenceGallery({ projectId, stepId }: { projectId: string; stepId: string }) {
  const { request } = useApiClient()
  const [selectedIdx, setSelectedIdx] = useState(0)

  const { data: items, isLoading } = useQuery<EvidenceItem[]>({
    queryKey: ['evidence', projectId, stepId],
    queryFn: () => request<EvidenceItem[]>(`/projects/${projectId}/evidence/${stepId}`),
  })

  if (isLoading) return <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
  if (!items || items.length === 0) return null

  const selected = items[selectedIdx]

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Main screenshot */}
      {selected && selected.mimeType.startsWith('image/') && (
        <div className="bg-slate-900 flex items-center justify-center p-2">
          <img
            src={selected.downloadUrl}
            alt={`Evidence ${selectedIdx + 1}`}
            className="max-h-64 rounded object-contain"
          />
        </div>
      )}

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div className="flex gap-1 p-2 overflow-x-auto bg-slate-50">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setSelectedIdx(i)}
              className={`shrink-0 h-12 w-16 rounded border-2 overflow-hidden transition-all ${
                i === selectedIdx ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'
              }`}
            >
              {item.mimeType.startsWith('image/') ? (
                <img src={item.downloadUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-slate-400">{item.type}</div>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="px-2 py-1 text-[10px] text-slate-400">
        {items.length} evidence item{items.length !== 1 ? 's' : ''}
        {selected && ` · ${selected.type}`}
      </div>
    </div>
  )
}
