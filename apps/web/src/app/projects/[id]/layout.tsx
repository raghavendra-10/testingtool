import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ProjectLayout } from './project-layout'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return <ProjectLayout projectId={params.id}>{children}</ProjectLayout>
}
