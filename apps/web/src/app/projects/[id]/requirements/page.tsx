'use client'
import { useParams } from 'next/navigation'
import { RequirementList } from '@/components/requirements/requirement-list'
export default function Page() { const { id } = useParams<{ id: string }>(); return <RequirementList projectId={id} /> }
