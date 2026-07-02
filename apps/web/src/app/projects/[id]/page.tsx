'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { UploadZone } from '@/components/documents/upload-zone'
import { DocumentList } from '@/components/documents/document-list'
import { PipelineDashboard } from '@/components/projects/pipeline-dashboard'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { request } = useApiClient()

  const { data: docs } = useQuery<Array<{ status: string }>>({
    queryKey: ['documents', id],
    queryFn: () => request<Array<{ status: string }>>(`/projects/${id}/documents`),
  })

  // Show pipeline dashboard if there are active pipelines
  const hasProcessing = docs?.some(d => d.status === 'pending' || d.status === 'processing')
  const hasDocs = docs && docs.length > 0

  return (
    <div className="space-y-6">
      {/* Pipeline dashboard when processing */}
      {hasProcessing && <PipelineDashboard projectId={id} />}

      {/* Always show upload zone + document list */}
      {!hasProcessing && (
        <>
          <h2 className="text-sm font-medium text-slate-700">Spec Documents</h2>
          <UploadZone projectId={id} />
        </>
      )}
      {hasDocs && !hasProcessing && <DocumentList projectId={id} />}
    </div>
  )
}
