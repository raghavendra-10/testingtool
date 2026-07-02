'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface Credential {
  id: string
  name: string
  type: string
  preview: string | null
  environmentId: string | null
  createdAt: string
}

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  createdAt: string
}

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
  isDefault: boolean
  createdAt: string
}

const CRED_TYPES = [
  { value: 'bearer',        label: 'Bearer Token' },
  { value: 'api_key',       label: 'API Key' },
  { value: 'basic_auth',    label: 'Basic Auth' },
  { value: 'oauth2',        label: 'OAuth 2.0' },
  { value: 'custom_header', label: 'Custom Header' },
]

const TYPE_COLOR: Record<string, string> = {
  bearer:        'bg-purple-50 text-purple-600',
  api_key:       'bg-blue-50 text-blue-600',
  basic_auth:    'bg-amber-50 text-amber-600',
  oauth2:        'bg-green-50 text-green-600',
  custom_header: 'bg-muted text-muted-foreground',
}

type Section = 'environments' | 'credentials' | 'api-keys' | 'webhooks' | 'integrations'

export function SettingsPanel({ projectId, section }: { projectId: string; section?: Section }) {
  const { request } = useApiClient()
  const queryClient = useQueryClient()

  // --- Credentials state ---
  const [showCredForm, setShowCredForm] = useState(false)
  const [credName, setCredName] = useState('')
  const [credType, setCredType] = useState('bearer')
  const [credValue, setCredValue] = useState('')
  const [credEnvId, setCredEnvId] = useState('')

  // --- Environment state ---
  const [showEnvForm, setShowEnvForm] = useState(false)
  const [envName, setEnvName] = useState('')
  const [envBaseUrl, setEnvBaseUrl] = useState('')

  // --- API Key state ---
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)

  // --- Schedule state ---
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduleName, setScheduleName] = useState('')
  const [scheduleInterval, setScheduleInterval] = useState('6')
  const [scheduleEnvId, setScheduleEnvId] = useState('')

  const { data: creds, isLoading: credsLoading } = useQuery<Credential[]>({
    queryKey: ['credentials', projectId],
    queryFn: () => request<Credential[]>(`/projects/${projectId}/credentials`),
  })

  const { data: envs, isLoading: envsLoading } = useQuery<Environment[]>({
    queryKey: ['environments', projectId],
    queryFn: () => request<Environment[]>(`/projects/${projectId}/environments`),
  })

  const { data: apiKeysData } = useQuery<ApiKey[]>({
    queryKey: ['api-keys', projectId],
    queryFn: () => request<ApiKey[]>(`/projects/${projectId}/api-keys`),
  })

  const addApiKey = useMutation({
    mutationFn: () => request<{ key: string; name: string }>(`/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name: keyName }),
    }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys', projectId] })
      setNewKeyValue((data as { key: string }).key)
      setShowKeyForm(false); setKeyName('')
    },
  })

  const revokeApiKey = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['api-keys', projectId] }),
  })

  const { data: schedulesData } = useQuery<Schedule[]>({
    queryKey: ['schedules', projectId],
    queryFn: () => request<Schedule[]>(`/projects/${projectId}/schedules`),
  })

  const addSchedule = useMutation({
    mutationFn: () => request(`/projects/${projectId}/schedules`, {
      method: 'POST',
      body: JSON.stringify({ name: scheduleName, intervalHours: parseInt(scheduleInterval, 10), environmentId: scheduleEnvId || undefined }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules', projectId] })
      setShowScheduleForm(false); setScheduleName(''); setScheduleInterval('6'); setScheduleEnvId('')
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

  const addCred = useMutation({
    mutationFn: () => request(`/projects/${projectId}/credentials`, {
      method: 'POST',
      body: JSON.stringify({ name: credName, type: credType, value: credValue, environmentId: credEnvId || undefined }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credentials', projectId] })
      setShowCredForm(false); setCredName(''); setCredType('bearer'); setCredValue(''); setCredEnvId('')
    },
  })

  const deleteCred = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/credentials/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['credentials', projectId] }),
  })

  const addEnv = useMutation({
    mutationFn: () => request(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify({ name: envName, baseUrl: envBaseUrl }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['environments', projectId] })
      setShowEnvForm(false); setEnvName(''); setEnvBaseUrl('')
    },
  })

  const deleteEnv = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/environments/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['environments', projectId] }),
  })

  const show = (s: Section) => !section || section === s

  return (
    <div className="space-y-8">
      {show('environments') && <>
      {/* Environments Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Environments</h3>
            <p className="text-xs text-muted-foreground">Configure API environments (dev, staging, prod) with their base URLs</p>
          </div>
          <button
            onClick={() => setShowEnvForm(!showEnvForm)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            {showEnvForm ? 'Cancel' : 'Add Environment'}
          </button>
        </div>

        {showEnvForm && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={envName} onChange={(e) => setEnvName(e.target.value)}
                placeholder="e.g. Production"
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              />
              <input
                value={envBaseUrl} onChange={(e) => setEnvBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
                type="url"
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <button
              onClick={() => addEnv.mutate()}
              disabled={!envName || !envBaseUrl || addEnv.isPending}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {addEnv.isPending ? 'Saving...' : 'Save Environment'}
            </button>
          </div>
        )}

        {envsLoading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted"/>)}</div>
        ) : !envs || envs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <p className="text-xs text-muted-foreground">No environments configured. Add one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-white">
            {envs.map((env) => (
              <div key={env.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{env.name}</p>
                    {env.isDefault && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">default</span>
                    )}
                  </div>
                  <p className="truncate text-xs font-mono text-muted-foreground">{env.baseUrl}</p>
                </div>
                <button
                  onClick={() => deleteEnv.mutate(env.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </>}

      {show('credentials') && <>
      {/* Credentials Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Credentials</h3>
            <p className="text-xs text-muted-foreground">API keys and tokens are encrypted at rest (AES-256-GCM)</p>
          </div>
          <button
            onClick={() => setShowCredForm(!showCredForm)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            {showCredForm ? 'Cancel' : 'Add Credential'}
          </button>
        </div>

        {showCredForm && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={credName} onChange={(e) => setCredName(e.target.value)}
                placeholder="e.g. Production API Key"
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              />
              <select
                value={credType} onChange={(e) => setCredType(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {CRED_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                value={credValue} onChange={(e) => setCredValue(e.target.value)}
                placeholder="Enter secret value"
                type="password"
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              />
              <select
                value={credEnvId} onChange={(e) => setCredEnvId(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
              >
                <option value="">All environments</option>
                {envs?.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => addCred.mutate()}
              disabled={!credName || !credValue || addCred.isPending}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {addCred.isPending ? 'Encrypting...' : 'Save Credential'}
            </button>
            {addCred.isError && <p className="mt-2 text-xs text-red-500">{addCred.error.message}</p>}
          </div>
        )}

        {credsLoading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted"/>)}</div>
        ) : !creds || creds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <p className="text-xs text-muted-foreground">No credentials stored. Add API keys or tokens for your test endpoints.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-white">
            {creds.map((cred) => (
              <div key={cred.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{cred.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[cred.type] ?? 'bg-muted text-muted-foreground'}`}>
                      {cred.type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cred.preview ? `••••••••${cred.preview}` : '••••••••••••'}
                    {cred.environmentId && envs ? ` · ${envs.find(e => e.id === cred.environmentId)?.name ?? 'Unknown env'}` : ' · All environments'}
                  </p>
                </div>
                <button
                  onClick={() => deleteCred.mutate(cred.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </>}

      {show('api-keys') && <>
      {/* API Keys Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">API Keys</h3>
            <p className="text-xs text-muted-foreground">For CLI access and CI/CD pipelines</p>
          </div>
          <button
            onClick={() => { setShowKeyForm(!showKeyForm); setNewKeyValue(null) }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            {showKeyForm ? 'Cancel' : 'Create API Key'}
          </button>
        </div>

        {/* New key reveal */}
        {newKeyValue && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-xs font-medium text-green-800 mb-2">Copy your API key now — it won't be shown again:</p>
            <code className="block rounded bg-white p-2 text-xs font-mono text-foreground break-all border border-green-200">
              {newKeyValue}
            </code>
            <p className="mt-2 text-xs text-green-600">
              Usage: <code className="font-mono">npx @speclyn/cli run --project {projectId} --api-key {newKeyValue.slice(0, 12)}...</code>
            </p>
          </div>
        )}

        {showKeyForm && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
            <input
              value={keyName} onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. CI Pipeline Key"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={() => addApiKey.mutate()}
              disabled={!keyName || addApiKey.isPending}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {addApiKey.isPending ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        )}

        {apiKeysData && apiKeysData.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border bg-white">
            {apiKeysData.map((key) => (
              <div key={key.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{key.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.keyPrefix}
                    {key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : ' · Never used'}
                  </p>
                </div>
                <button
                  onClick={() => revokeApiKey.mutate(key.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </>}

      {show('webhooks') && <>
      {/* Outbound Webhooks Section */}
      <div>
        <h3 className="mb-1 text-sm font-medium text-foreground">Outbound Webhooks</h3>
        <p className="mb-3 text-xs text-muted-foreground">Send test results to external systems when events occur</p>
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-xs text-muted-foreground">Webhook management coming soon.</p>
          <p className="mt-1 text-xs text-muted-foreground">Events: run_completed, defect_created, coverage_changed</p>
        </div>
      </div>
      </>}

      {show('integrations') && <>
      {/* CI/CD Integration Section */}
      <div>
        <h3 className="mb-1 text-sm font-medium text-foreground">CI/CD Integration</h3>
        <p className="mb-3 text-xs text-muted-foreground">Connect GitHub or Bitbucket to run tests on every PR</p>
        <div className="rounded-xl border border-border bg-white p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">CLI Usage</p>
            <code className="block rounded bg-muted/50 p-2 text-xs font-mono text-muted-foreground">
              npx @speclyn/cli run --project {projectId} --api-key YOUR_KEY --base-url https://api.example.com
            </code>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">GitHub Actions</p>
            <pre className="rounded bg-muted/50 p-2 text-xs font-mono text-muted-foreground whitespace-pre overflow-x-auto">{`- name: Run Speclyn Tests
  run: npx @speclyn/cli run \\
    --project ${projectId} \\
    --api-key \${{ secrets.SPECLYN_API_KEY }} \\
    --base-url \${{ env.DEPLOY_URL }} \\
    --threshold 80`}</pre>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">GitHub Webhook URL</p>
            <code className="block rounded bg-muted/50 p-2 text-xs font-mono text-muted-foreground break-all">
              {'<your-api-domain>'}/api/v1/webhooks/github
            </code>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Bitbucket Webhook URL</p>
            <code className="block rounded bg-muted/50 p-2 text-xs font-mono text-muted-foreground break-all">
              {'<your-api-domain>'}/api/v1/webhooks/bitbucket
            </code>
          </div>
        </div>
      </div>
      </>}
    </div>
  )
}
