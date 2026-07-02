import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { DashboardHome } from '@/components/dashboard/dashboard-home'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <DashboardShell activePath="/dashboard">
      <DashboardHome />
    </DashboardShell>
  )
}
