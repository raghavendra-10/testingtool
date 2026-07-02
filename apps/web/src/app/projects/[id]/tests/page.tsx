'use client'
import { useParams } from 'next/navigation'
import { TestEditor } from '@/components/tests/test-editor'
export default function Page() { const { id } = useParams<{ id: string }>(); return <TestEditor projectId={id} /> }
