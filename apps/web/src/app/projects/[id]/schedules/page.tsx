'use client'
import { useParams } from 'next/navigation'
import { ScheduleList } from '@/components/schedules/schedule-list'
export default function Page() { const { id } = useParams<{ id: string }>(); return <ScheduleList projectId={id} /> }
