'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { Clock } from 'lucide-react'

interface Schedule {
  id: string
  name: string
  intervalHours: number
  enabled: boolean
  environmentId: string | null
  lastRunAt: string | null
  nextRunAt: string | null
}

interface Environment {
  id: string
  name: string
  baseUrl: string
}

export function ScheduleList({ projectId }: { projectId: string }) {
  const { request } = useApiClient()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [interval, setInterval] = useState('6')
  const [envId, setEnvId] = useState('')

  const { data: schedules, isLoading } = useQuery<Schedule[]>({
    queryKey: ['schedules', projectId],
    queryFn: () => request<Schedule[]>(`/projects/${projectId}/schedules`),
  })

  const { data: envs } = useQuery<Environment[]>({
    queryKey: ['environments', projectId],
    queryFn: () => request<Environment[]>(`/projects/${projectId}/environments`),
  })

  const addSchedule = useMutation({
    mutationFn: () => request(`/projects/${projectId}/schedules`, {
      method: 'POST',
      body: JSON.stringify({ name, intervalHours: parseInt(interval, 10), environmentId: envId || undefined }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules', projectId] })
      setShowForm(false); setName(''); setInterval('6'); setEnvId('')
    },
  })

  const toggleSchedule = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/schedules/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['schedules', projectId] }),
  })

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['schedules', projectId] }),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Scheduled Runs</h2>
          <p className="text-xs text-muted-foreground">Automatically run tests at regular intervals</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Schedule'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nightly check"
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
            />
            <select
              value={interval} onChange={(e) => setInterval(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
            >
              <option value="1">Every hour</option>
              <option value="3">Every 3 hours</option>
              <option value="6">Every 6 hours</option>
              <option value="12">Every 12 hours</option>
              <option value="24">Daily</option>
              <option value="168">Weekly</option>
            </select>
            <select
              value={envId} onChange={(e) => setEnvId(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
            >
              <option value="">Default environment</option>
              {envs?.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
            </select>
          </div>
          <button
            onClick={() => addSchedule.mutate()}
            disabled={!name || addSchedule.isPending}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {addSchedule.isPending ? 'Creating...' : 'Create Schedule'}
          </button>
        </div>
      )}

      {!schedules || schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No scheduled runs configured.</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a schedule to test your API automatically.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-white">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
              <button
                onClick={() => toggleSchedule.mutate(s.id)}
                className={`shrink-0 h-5 w-9 rounded-full transition-colors ${s.enabled ? 'bg-green-500' : 'bg-muted'}`}
              >
                <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${s.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  Every {s.intervalHours}h
                  {s.nextRunAt ? ` · Next: ${new Date(s.nextRunAt).toLocaleString()}` : ''}
                  {s.lastRunAt ? ` · Last: ${new Date(s.lastRunAt).toLocaleString()}` : ''}
                </p>
              </div>
              <button
                onClick={() => deleteSchedule.mutate(s.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
