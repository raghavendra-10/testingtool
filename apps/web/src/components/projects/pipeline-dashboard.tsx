'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface Document { id: string; filename: string; status: string; requirementCount: number | null }
interface RepoConn { id: string; platform: string; repoUrl: string; status: string; endpointCount: number | null }

interface PipelineStage {
  name: string
  status: 'waiting' | 'processing' | 'done' | 'error'
  count?: number
  detail?: string
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  waiting: <span className="h-3 w-3 rounded-full bg-slate-200" />,
  processing: (
    <svg className="h-3 w-3 animate-spin text-indigo-500" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  done: (
    <svg className="h-3 w-3 text-green-500" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg className="h-3 w-3 text-red-500" viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
}

export function PipelineDashboard({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  // No polling — WebSocket (use-project-socket) handles invalidation
  // for document.updated, requirements.updated, endpoints.updated events
  const { data: docs } = useQuery<Document[]>({
    queryKey: ['documents', projectId],
    queryFn: () => request<Document[]>(`/projects/${projectId}/documents`),
  })

  const { data: repos } = useQuery<RepoConn[]>({
    queryKey: ['repositories', projectId],
    queryFn: () => request<RepoConn[]>(`/projects/${projectId}/repositories`),
  })

  const { data: reqs } = useQuery<unknown[]>({
    queryKey: ['requirements', projectId],
    queryFn: () => request<unknown[]>(`/projects/${projectId}/requirements`),
  })

  const { data: eps } = useQuery<unknown[]>({
    queryKey: ['endpoints', projectId],
    queryFn: () => request<unknown[]>(`/projects/${projectId}/endpoints`),
  })

  // Derive pipeline stages
  const stages: PipelineStage[] = []

  // Document parsing
  if (docs && docs.length > 0) {
    const processing = docs.filter(d => d.status === 'processing').length
    const done = docs.filter(d => d.status === 'done').length
    const errors = docs.filter(d => d.status === 'error').length
    stages.push({
      name: 'Parsing Documents',
      status: processing > 0 ? 'processing' : errors > 0 && done === 0 ? 'error' : done > 0 ? 'done' : 'waiting',
      count: docs.length,
      detail: `${done}/${docs.length} parsed${errors > 0 ? `, ${errors} errors` : ''}`,
    })
  }

  // Repo analysis
  if (repos && repos.length > 0) {
    const analyzing = repos.filter(r => r.status === 'analyzing').length
    const connected = repos.filter(r => r.status === 'connected').length
    const errors = repos.filter(r => r.status === 'error').length
    stages.push({
      name: 'Analyzing Repositories',
      status: analyzing > 0 ? 'processing' : errors > 0 && connected === 0 ? 'error' : connected > 0 ? 'done' : 'waiting',
      count: repos.length,
      detail: `${connected}/${repos.length} analyzed${errors > 0 ? `, ${errors} errors` : ''}`,
    })
  }

  // Requirement extraction
  stages.push({
    name: 'Extracting Requirements',
    status: (reqs?.length ?? 0) > 0 ? 'done' : docs?.some(d => d.status === 'processing') ? 'processing' : 'waiting',
    count: reqs?.length ?? 0,
    detail: `${reqs?.length ?? 0} requirements found`,
  })

  // Endpoint discovery
  stages.push({
    name: 'Discovering Endpoints',
    status: (eps?.length ?? 0) > 0 ? 'done' : repos?.some(r => r.status === 'analyzing') ? 'processing' : 'waiting',
    count: eps?.length ?? 0,
    detail: `${eps?.length ?? 0} endpoints discovered`,
  })

  const allDone = stages.every(s => s.status === 'done' || s.status === 'error')
  const hasProcessing = stages.some(s => s.status === 'processing')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          {hasProcessing ? 'Processing Your Project...' : allDone ? 'Setup Complete' : 'Waiting for Processing'}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {hasProcessing ? 'AI agents are analyzing your specs and code. This may take a few minutes.' : allDone ? 'All pipelines finished. Navigate the sidebar to explore your results.' : 'Pipelines will start shortly.'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`}
          style={{ width: `${Math.round((stages.filter(s => s.status === 'done').length / Math.max(stages.length, 1)) * 100)}%` }}
        />
      </div>

      {/* Pipeline stages */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {stages.map((stage) => (
          <div key={stage.name} className="flex items-center gap-4 px-5 py-4">
            <div className="shrink-0">{STATUS_ICON[stage.status]}</div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${stage.status === 'done' ? 'text-green-700' : stage.status === 'processing' ? 'text-indigo-700' : stage.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                {stage.name}
              </p>
              {stage.detail && <p className="text-xs text-slate-400">{stage.detail}</p>}
            </div>
            {stage.count != null && stage.count > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{stage.count}</span>
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-sm font-medium text-green-800">Ready to run tests!</p>
          <p className="mt-1 text-xs text-green-600">Go to the Execute tab in the sidebar to generate and run your first test suite.</p>
        </div>
      )}
    </div>
  )
}
