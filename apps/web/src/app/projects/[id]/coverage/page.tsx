'use client'
import { useParams } from 'next/navigation'
import { CoveragePanel } from '@/components/coverage/coverage-panel'
export default function Page() { const { id } = useParams<{ id: string }>(); return <CoveragePanel projectId={id} /> }
