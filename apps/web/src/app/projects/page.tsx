import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ProjectList } from '@/components/projects/project-list'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <DashboardShell activePath="/projects">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Projects</h1>
        <p className="mt-0.5 text-sm text-slate-500">Manage and monitor your API test suites</p>
      </div>
      <ProjectList />
    </DashboardShell>
  )
}
