'use client'
import { useParams } from 'next/navigation'
import { RepositoryPanel } from '@/components/repositories/repository-panel'
export default function Page() { const { id } = useParams<{ id: string }>(); return <RepositoryPanel projectId={id} /> }
