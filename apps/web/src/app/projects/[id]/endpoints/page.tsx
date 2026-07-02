'use client'
import { useParams } from 'next/navigation'
import { EndpointList } from '@/components/endpoints/endpoint-list'
export default function Page() { const { id } = useParams<{ id: string }>(); return <EndpointList projectId={id} /> }
