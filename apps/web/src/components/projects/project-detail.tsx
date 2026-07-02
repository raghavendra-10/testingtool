'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { useProjectSocket } from '@/hooks/use-project-socket'
import { UploadZone } from '@/components/documents/upload-zone'
import { DocumentList } from '@/components/documents/document-list'
import { RequirementList } from '@/components/requirements/requirement-list'
import { EndpointList } from '@/components/endpoints/endpoint-list'
import { RunPanel } from '@/components/execution/run-panel'
import { CoveragePanel } from '@/components/coverage/coverage-panel'
import { DefectList } from '@/components/defects/defect-list'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { TestEditor } from '@/components/tests/test-editor'
import { AuditLog } from '@/components/audit/audit-log'
import { ScheduleList } from '@/components/schedules/schedule-list'

interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
}

type Tab = 'docs' | 'requirements' | 'endpoints' | 'tests' | 'execute' | 'coverage' | 'defects' | 'schedules' | 'audit' | 'settings'

const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'docs', label: 'Spec Docs',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5"/></svg>,
  },
  {
    id: 'requirements', label: 'Requirements',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    id: 'endpoints', label: 'Endpoints',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h5M9 8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/></svg>,
  },
  {
    id: 'tests', label: 'Tests',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9l2 2 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    id: 'execute', label: 'Execute',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor" opacity="0.7"/></svg>,
  },
  {
    id: 'coverage', label: 'Coverage',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 2a6 6 0 0 1 0 12" fill="currentColor" opacity="0.3"/></svg>,
  },
  {
    id: 'defects', label: 'Defects',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v6M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 14h10L8 3 3 14z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  },
  {
    id: 'schedules', label: 'Schedules',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    id: 'audit', label: 'Audit Log',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
  {
    id: 'settings', label: 'Settings',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
]

export function ProjectDetail({ projectId, activeTab, setActiveTab }: {
  projectId: string
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
}) {
  const { request } = useApiClient()
  useProjectSocket(projectId)

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => request<Project>(`/projects/${projectId}`),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Project not found</p>
        <a href="/projects" className="mt-2 text-sm text-indigo-600 hover:text-indigo-500">
          Back to projects
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <a href="/projects" className="hover:text-muted-foreground transition-colors">Projects</a>
          <span>/</span>
          <span className="text-muted-foreground font-medium truncate max-w-[200px]">{project.name}</span>
        </nav>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{project.name}</h1>
        {project.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'docs' && (
        <div className="space-y-4">
          <UploadZone projectId={projectId} />
          <DocumentList projectId={projectId} />
        </div>
      )}
      {activeTab === 'requirements' && <RequirementList projectId={projectId} />}
      {activeTab === 'endpoints'    && <EndpointList    projectId={projectId} />}
      {activeTab === 'tests'        && <TestEditor     projectId={projectId} />}
      {activeTab === 'execute'      && <RunPanel        projectId={projectId} />}
      {activeTab === 'coverage'     && <CoveragePanel   projectId={projectId} />}
      {activeTab === 'defects'      && <DefectList      projectId={projectId} />}
      {activeTab === 'schedules'    && <ScheduleList    projectId={projectId} />}
      {activeTab === 'audit'        && <AuditLog        projectId={projectId} />}
      {activeTab === 'settings'     && <SettingsPanel   projectId={projectId} />}
    </div>
  )
}

/**
 * Sidebar nav items for use inside DashboardShell when on a project page.
 * Rendered as a separate component to pass activeTab state.
 */
export function ProjectSidebarNav({
  activeTab,
  onTabChange,
  projectId,
  projectName,
}: {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  projectId: string
  projectName: string
}) {
  return (
    <>
      {/* Project name */}
      <div className="px-3 mb-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{projectName}</p>
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === item.id
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          <span className="shrink-0">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </>
  )
}
