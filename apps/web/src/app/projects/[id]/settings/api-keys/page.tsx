'use client'
import { useParams } from 'next/navigation'
import { SettingsPanel } from '@/components/settings/settings-panel'
export default function Page() { const { id } = useParams<{ id: string }>(); return <SettingsPanel projectId={id} section="api-keys" /> }
