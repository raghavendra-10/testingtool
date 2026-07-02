'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { useProjectSocket } from '@/hooks/use-project-socket'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import {
  FileText, ListChecks, Plug, GitBranch, FileCheck, Play,
  PieChart, BarChart3, AlertTriangle, Clock, ClipboardList,
} from 'lucide-react'

const NAV_ITEMS: Array<{ segment: string; label: string; icon: React.ReactNode }> = [
  { segment: '', label: 'Spec Docs', icon: <FileText className="h-4 w-4" /> },
  { segment: 'requirements', label: 'Requirements', icon: <ListChecks className="h-4 w-4" /> },
  { segment: 'endpoints', label: 'Endpoints', icon: <Plug className="h-4 w-4" /> },
  { segment: 'repositories', label: 'Repositories', icon: <GitBranch className="h-4 w-4" /> },
  { segment: 'tests', label: 'Tests', icon: <FileCheck className="h-4 w-4" /> },
  { segment: 'execute', label: 'Execute', icon: <Play className="h-4 w-4" /> },
  { segment: 'coverage', label: 'Coverage', icon: <PieChart className="h-4 w-4" /> },
  { segment: 'analysis', label: 'Analysis', icon: <BarChart3 className="h-4 w-4" /> },
  { segment: 'defects', label: 'Defects', icon: <AlertTriangle className="h-4 w-4" /> },
  { segment: 'schedules', label: 'Schedules', icon: <Clock className="h-4 w-4" /> },
  { segment: 'audit', label: 'Audit Log', icon: <ClipboardList className="h-4 w-4" /> },
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
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
              isActive ? 'bg-indigo-50 text-indigo-600' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </a>
        )
      })}

      {/* Settings sub-items */}
      <div className="mx-3 my-3 border-t border-border" />
      <div className="px-3 mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Settings</p>
      </div>
      {SETTINGS_ITEMS.map((item) => {
        const href = `${basePath}/${item.segment}`
        const isActive = currentSegment === item.segment
        return (
          <a
            key={item.segment}
            href={href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-indigo-50 text-indigo-600' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
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
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <a href="/projects" className="hover:text-muted-foreground transition-colors">Projects</a>
          <span>/</span>
          <span className="text-muted-foreground font-medium truncate max-w-[200px]">{project?.name ?? '...'}</span>
        </nav>
        {children}
      </div>
    </DashboardShell>
  )
}
