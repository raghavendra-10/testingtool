import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { TemplateLibrary } from '@/components/templates/template-library'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <DashboardShell activePath="/templates">
      <TemplateLibrary />
    </DashboardShell>
  )
}
