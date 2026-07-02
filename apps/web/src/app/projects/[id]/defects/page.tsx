'use client'
import { useParams } from 'next/navigation'
import { DefectList } from '@/components/defects/defect-list'
export default function Page() { const { id } = useParams<{ id: string }>(); return <DefectList projectId={id} /> }
