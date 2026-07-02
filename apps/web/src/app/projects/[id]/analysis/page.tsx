'use client'
import { useParams } from 'next/navigation'
import { AnalysisPanel } from '@/components/analysis/analysis-panel'
export default function Page() { const { id } = useParams<{ id: string }>(); return <AnalysisPanel projectId={id} /> }
