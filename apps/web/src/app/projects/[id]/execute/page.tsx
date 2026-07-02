'use client'
import { useParams } from 'next/navigation'
import { RunPanel } from '@/components/execution/run-panel'
export default function Page() { const { id } = useParams<{ id: string }>(); return <RunPanel projectId={id} /> }
