'use client'
import { useParams } from 'next/navigation'
import { AuditLog } from '@/components/audit/audit-log'
export default function Page() { const { id } = useParams<{ id: string }>(); return <AuditLog projectId={id} /> }
