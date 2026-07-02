'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { useProjectSocket } from '@/hooks/use-project-socket'
import { DashboardShell } from '@/components/layout/dashboard-shell'

const NAV_ITEMS: Array<{ segment: string; label: string; icon: React.ReactNode }> = [
  { segment: '', label: 'Spec Docs', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { segment: 'requirements', label: 'Requirements', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { segment: 'endpoints', label: 'Endpoints', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h5M9 8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { segment: 'repositories', label: 'Repositories', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2v12M6 2L2 6M6 2l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 14V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { segment: 'tests', label: 'Tests', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9l2 2 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { segment: 'execute', label: 'Execute', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor" opacity="0.7"/></svg> },
  { segment: 'coverage', label: 'Coverage', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 2a6 6 0 0 1 0 12" fill="currentColor" opacity="0.3"/></svg> },
  { segment: 'analysis', label: 'Analysis', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 13V7M7 13V5M11 13V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { segment: 'defects', label: 'Defects', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v6M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 14h10L8 3 3 14z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
  { segment: 'schedules', label: 'Schedules', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { segment: 'audit', label: 'Audit Log', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
]

const SETTINGS_ITEMS: Array<{ segment: string; label: string }> = [
  { segment: 'settings/environments', label: 'Environments' },
  { segment: 'settings/credentials', label: 'Credentials' },
  { segment: 'settings/api-keys', label: 'API Keys' },
  { segment: 'settings/webhooks', label: 'Webhooks' },
  { segment: 'settings/integrations', label: 'CI/CD' },
]

export function ProjectLayout({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const { request } = useApiClient()
  useProjectSocket(projectId)

  const { data: project } = useQuery<{ name: string }>({
    queryKey: ['project', projectId],
    queryFn: () => request<{ name: string }>(`/projects/${projectId}`),
    staleTime: 5 * 60_000,
  })

  const basePath = `/projects/${projectId}`

  // Determine active segment from pathname
  const currentSegment = pathname.replace(basePath, '').replace(/^\//, '')

  const sidebarContent = (
    <>
      <div className="px-3 mb-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-400">
          {project?.name ?? 'Loading...'}
        </p>
      </div>

      {NAV_ITEMS.map((item) => {
        const href = item.segment ? `${basePath}/${item.segment}` : basePath
        const isActive = item.segment === '' ? currentSegment === '' : currentSegment.startsWith(item.segment)
        return (
          <a
            key={item.segment || 'docs'}
            href={href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </a>
        )
      })}

      {/* Settings sub-items */}
      <div className="mx-3 my-3 border-t border-slate-100" />
      <div className="px-3 mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Settings</p>
      </div>
      {SETTINGS_ITEMS.map((item) => {
        const href = `${basePath}/${item.segment}`
        const isActive = currentSegment === item.segment
        return (
          <a
            key={item.segment}
            href={href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {item.label}
          </a>
        )
      })}
    </>
  )

  return (
    <DashboardShell sidebarContent={sidebarContent}>
      <div>
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-400">
          <a href="/projects" className="hover:text-slate-600 transition-colors">Projects</a>
          <span>/</span>
          <span className="text-slate-600 font-medium truncate max-w-[200px]">{project?.name ?? '...'}</span>
        </nav>
        {children}
      </div>
    </DashboardShell>
  )
}
