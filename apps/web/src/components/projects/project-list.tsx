'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useApiClient } from '@/hooks/use-api-client'

interface Project {
  id: string
  name: string
  description: string | null
  lastActivityAt: string | null
  createdAt: string
}

export function ProjectList() {
  const { request } = useApiClient()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => request<Project[]>('/projects'),
  })

  const createProject = useMutation({
    mutationFn: (name: string) =>
      request<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setCreating(false)
      setNewName('')
    },
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {projects?.length ?? 0} {projects?.length === 1 ? 'project' : 'projects'}
        </p>
        <a
          href="/projects/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Project
        </a>
      </div>

      {/* Inline create form */}
      {creating && (
        <div className="mb-4 flex gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) createProject.mutate(newName.trim())
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            placeholder="Project name"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            onClick={() => newName.trim() && createProject.mutate(newName.trim())}
            disabled={!newName.trim() || createProject.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {createProject.isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            onClick={() => { setCreating(false); setNewName('') }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Empty state */}
      {!creating && projects?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-20">
          <div className="mb-3 rounded-xl bg-indigo-50 p-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="8" height="8" rx="2" fill="#6366f1" opacity="0.5" />
              <rect x="13" y="3" width="8" height="8" rx="2" fill="#6366f1" opacity="0.5" />
              <rect x="3" y="13" width="8" height="8" rx="2" fill="#6366f1" opacity="0.5" />
              <rect x="13" y="13" width="8" height="8" rx="2" fill="#6366f1" opacity="0.2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">No projects yet</p>
          <p className="mt-1 text-sm text-slate-400">Create your first project to get started</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Create project
          </button>
        </div>
      )}

      {/* Project grid */}
      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-card hover:shadow-card-hover hover:border-slate-300 transition-all duration-150"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {project.name}
                </h3>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0 text-slate-300 group-hover:text-indigo-400 transition-colors">
                  <path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {project.description && (
                <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{project.description}</p>
              )}
              <p className="mt-auto pt-3 text-xs text-slate-400">
                {project.lastActivityAt
                  ? `Updated ${new Date(project.lastActivityAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : `Created ${new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
