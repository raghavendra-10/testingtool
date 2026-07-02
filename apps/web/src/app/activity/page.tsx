import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ActivityFeed } from '@/components/activity/activity-feed'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <DashboardShell activePath="/activity">
      <ActivityFeed />
    </DashboardShell>
  )
}
