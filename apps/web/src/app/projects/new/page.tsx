import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SetupWizard } from '@/components/projects/setup-wizard'

export const dynamic = 'force-dynamic'

export default async function NewProjectPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <DashboardShell activePath="/projects">
      <SetupWizard />
    </DashboardShell>
  )
}
