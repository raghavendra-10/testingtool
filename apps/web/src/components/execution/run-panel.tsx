'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { Loader2, Check, X } from 'lucide-react'

interface Run {
  id: string
  status: string
  totalTests: number
  passed: number
  failed: number
  coveragePercent: number | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

interface RunStep {
  id: string
  testId: string
  testName: string
  status: string
  errorType: string | null
  errorMessage: string | null
  durationMs: number | null
  startedAt: string | null
  completedAt: string | null
}

interface RunDetail extends Run {
  steps: RunStep[]
}

interface StepEvent {
  type: 'step_started' | 'step_completed' | 'step_failed' | 'run_completed' | 'run_status' | 'contract_check'
  testName?: string
  status?: string
  durationMs?: number
  errorMessage?: string
  passed?: number
  failed?: number
  coveragePercent?: number
  totalTests?: number
  message?: string
  meta?: string
}

interface LiveStep {
  testName: string
  status: 'running' | 'passed' | 'failed'
  durationMs?: number
  errorMessage?: string
  meta?: string
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

const STATUS_COLOR: Record<string, string> = {
  pending:    'bg-muted text-muted-foreground',
  generating: 'bg-amber-50 text-amber-600',
  running:    'bg-blue-50 text-blue-600',
  passed:     'bg-green-50 text-green-600',
  failed:     'bg-red-50 text-red-600',
  error:      'bg-red-50 text-red-600',
  cancelled:  'bg-orange-50 text-orange-600',
}

export function RunPanel({ projectId }: { projectId: string }) {
  const { request }    = useApiClient()
  const queryClient    = useQueryClient()
  const [tab, setTab]                 = useState<'api' | 'browser' | 'performance'>('api')
  const [baseUrl, setBaseUrl]         = useState('https://jsonplaceholder.typicode.com')
  const [selectedEnvId, setSelectedEnvId] = useState<string>('')
  const [pageUrlsInput, setPageUrlsInput] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [liveSteps, setLiveSteps]     = useState<LiveStep[]>([])
  const [liveStatus, setLiveStatus]   = useState<string>('pending')
  const [liveCounts, setLiveCounts]   = useState({ passed: 0, failed: 0, total: 0 })
  const [runDone, setRunDone]         = useState(false)
  const [sseError, setSseError]       = useState<string | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const esRef       = useRef<EventSource | null>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  interface Env { id: string; name: string; baseUrl: string; isDefault: boolean }
  const { data: envs } = useQuery<Env[]>({
    queryKey: ['environments', projectId],
    queryFn: () => request<Env[]>(`/projects/${projectId}/environments`),
  })

  const { data: runs } = useQuery<Run[]>({
    queryKey: ['runs', projectId],
    queryFn: () => request<Run[]>(`/projects/${projectId}/runs`),
    refetchInterval: false,
    staleTime: 0,
  })

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (!runDone && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [liveSteps.length, runDone])

  const openSseStream = useCallback(async (runId: string) => {
    esRef.current?.close()
    setSseError(null)

    let token: string
    try {
      const result = await request<{ token: string }>(
        `/projects/${projectId}/runs/${runId}/stream-token`,
        { method: 'POST' },
      )
      token = result.token
    } catch (err) {
      setSseError('Failed to connect to live stream')
      return
    }

    const es = new EventSource(
      `${API_BASE}/api/v1/projects/${projectId}/runs/${runId}/events?token=${token}`,
    )
    esRef.current = es

    es.addEventListener('step', (e: MessageEvent) => {
      const event = JSON.parse(e.data as string) as StepEvent

      if (event.type === 'run_status') {
        setLiveStatus(event.status ?? 'generating')
        if (event.totalTests) setLiveCounts(c => ({ ...c, total: event.totalTests! }))
        void queryClient.invalidateQueries({ queryKey: ['runs', projectId] })
        if (event.status === 'cancelled') {
          setRunDone(true)
          es.close()
        }
        return
      }

      if (event.type === 'step_started') {
        setLiveSteps(prev => {
          if (prev.some(s => s.testName === event.testName)) return prev
          return [...prev, { testName: event.testName ?? '', status: 'running' }]
        })
        return
      }

      // Contract check events — show as informational step in the live log
      if (event.type === 'contract_check') {
        const endpoint = (event as unknown as { endpoint?: string; isCompliant?: boolean; summary?: string; errors?: number; warnings?: number }).endpoint ?? ''
        const isCompliant = (event as unknown as { isCompliant?: boolean }).isCompliant ?? true
        const summary = (event as unknown as { summary?: string }).summary ?? ''
        const step: LiveStep = {
          testName: `[Contract] ${endpoint}`,
          status: isCompliant ? 'passed' : 'failed',
          meta: summary,
        }
        setLiveSteps(prev => [...prev, step])
        if (!isCompliant) setLiveCounts(c => ({ ...c, failed: c.failed + 1 }))
        return
      }

      if (event.type === 'step_completed' || event.type === 'step_failed') {
        const isPass = event.type === 'step_completed' && event.status !== 'failed'
        setLiveCounts(c => isPass ? { ...c, passed: c.passed + 1 } : { ...c, failed: c.failed + 1 })
        setLiveSteps(prev => {
          const exists = prev.some(s => s.testName === event.testName)
          if (!exists) {
            // Snapshot replay — add completed step directly
            const step: LiveStep = { testName: event.testName ?? '', status: isPass ? 'passed' : 'failed' }
            if (event.durationMs != null) step.durationMs = event.durationMs
            if (event.errorMessage != null) step.errorMessage = event.errorMessage
            if (event.meta != null) step.meta = event.meta
            return [...prev, step]
          }
          return prev.map((s): LiveStep => {
            if (s.testName !== event.testName) return s
            const updated: LiveStep = { ...s, status: isPass ? 'passed' : 'failed' }
            if (event.durationMs != null) updated.durationMs = event.durationMs
            if (event.errorMessage != null) updated.errorMessage = event.errorMessage
            if (event.meta != null) updated.meta = event.meta
            return updated
          })
        })
      }
    })

    es.addEventListener('done', () => {
      setRunDone(true)
      es.close()
      void queryClient.invalidateQueries({ queryKey: ['runs', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['coverage', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['defects', projectId] })
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !runDone) {
        setTimeout(() => void openSseStream(runId), 3000)
      }
    }
  }, [projectId, request, queryClient, API_BASE, runDone])

  // On mount: reconnect to in-progress run
  useEffect(() => {
    if (!runs || runs.length === 0 || activeRunId) return
    const latest = runs[0]!
    if (['generating', 'running'].includes(latest.status)) {
      setActiveRunId(latest.id)
      setLiveStatus(latest.status)
      setLiveCounts({ passed: latest.passed, failed: latest.failed, total: latest.totalTests })
      setRunDone(false)
      void openSseStream(latest.id)
    }
  }, [runs, activeRunId, openSseStream])

  // Tab visibility: reconnect SSE when tab becomes visible
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && activeRunId && !runDone) {
        void openSseStream(activeRunId)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeRunId, runDone, openSseStream])

  // Cleanup on unmount
  useEffect(() => () => { esRef.current?.close() }, [])

  const createRun = useMutation({
    mutationFn: () => request<Run>(`/projects/${projectId}/runs`, {
      method: 'POST',
      body: JSON.stringify({ baseUrl }),
    }),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['runs', projectId] })
      setActiveRunId(run.id)
      setLiveSteps([])
      setLiveCounts({ passed: 0, failed: 0, total: 0 })
      setLiveStatus('generating')
      setRunDone(false)
      setExpandedStep(null)
      setSseError(null)
      void openSseStream(run.id)
    },
  })

  const cancelRun = useMutation({
    mutationFn: () => request<{ id: string; status: string }>(`/projects/${projectId}/runs/${activeRunId}/cancel`, {
      method: 'POST',
    }),
    onSuccess: () => {
      setLiveStatus('cancelled')
      setRunDone(true)
      esRef.current?.close()
      void queryClient.invalidateQueries({ queryKey: ['runs', projectId] })
    },
  })

  const createBrowserRun = useMutation({
    mutationFn: () => {
      const pageUrls = pageUrlsInput.split('\n').map(u => u.trim()).filter(Boolean)
      return request<Run>(`/projects/${projectId}/browser-runs`, {
        method: 'POST',
        body: JSON.stringify({ pageUrls, baseUrl }),
      })
    },
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['runs', projectId] })
      setActiveRunId(run.id)
      setLiveSteps([])
      setLiveCounts({ passed: 0, failed: 0, total: 0 })
      setLiveStatus('generating')
      setRunDone(false)
      setExpandedStep(null)
      setSseError(null)
      void openSseStream(run.id)
    },
  })

  // k6 performance script state
  const [k6Config, setK6Config] = useState({ targetRps: 100, durationSeconds: 60 })
  const [k6Script, setK6Script] = useState<string | null>(null)
  const [k6Error, setK6Error]   = useState<string | null>(null)

  const generateK6 = useMutation({
    mutationFn: () =>
      request<{ script: string; usage: string; endpointCount: number }>(`/projects/${projectId}/performance/k6`, {
        method: 'POST',
        body: JSON.stringify(k6Config),
      }),
    onSuccess: (data) => { setK6Script(data.script); setK6Error(null) },
    onError: (err) => { setK6Error(err.message) },
  })

  // Click run in history: load steps for completed runs, reconnect SSE for active ones
  async function selectRun(run: Run) {
    esRef.current?.close()
    setActiveRunId(run.id)
    setLiveStatus(run.status)
    setLiveCounts({ passed: run.passed, failed: run.failed, total: run.totalTests })
    setExpandedStep(null)
    setSseError(null)

    if (['passed', 'failed', 'error', 'cancelled'].includes(run.status)) {
      setRunDone(true)
      try {
        const detail = await request<RunDetail>(`/projects/${projectId}/runs/${run.id}`)
        setLiveSteps(detail.steps.map(s => {
          const step: LiveStep = { testName: s.testName, status: s.status === 'passed' ? 'passed' : 'failed' }
          if (s.durationMs != null) step.durationMs = s.durationMs
          if (s.errorMessage != null) step.errorMessage = s.errorMessage
          return step
        }))
      } catch {
        setLiveSteps([])
      }
    } else {
      setRunDone(false)
      setLiveSteps([])
      void openSseStream(run.id)
    }
  }

  const activeRun = runs?.find(r => r.id === activeRunId) ?? runs?.[0]
  const displayStatus = activeRunId ? liveStatus : (activeRun?.status ?? 'pending')
  const derivedTotal = Math.max(liveCounts.total, liveSteps.length)
  const completedCount = liveCounts.passed + liveCounts.failed

  const isRunActive = activeRunId != null && !runDone && ['generating', 'running', 'pending'].includes(liveStatus)

  return (
    <div className="space-y-6">
      {/* Trigger */}
      <div className="rounded-xl border border-border bg-white p-5">
        {/* Tab toggle */}
        <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit">
          <button
            onClick={() => setTab('api')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'api' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            API Tests
          </button>
          <button
            onClick={() => setTab('browser')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'browser' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Browser Tests
          </button>
          <button
            onClick={() => setTab('performance')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'performance' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Performance
          </button>
        </div>

        {tab === 'api' && (
          <>
            <h3 className="mb-3 text-sm font-medium text-foreground">Run API Tests</h3>
            {envs && envs.length > 0 && (
              <div className="mb-3">
                <select
                  value={selectedEnvId}
                  onChange={(e) => {
                    setSelectedEnvId(e.target.value)
                    const env = envs.find(env => env.id === e.target.value)
                    if (env) setBaseUrl(env.baseUrl)
                  }}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none transition-colors sm:w-auto"
                >
                  <option value="">Custom URL</option>
                  {envs.map((env) => (
                    <option key={env.id} value={env.id}>{env.name} — {env.baseUrl}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setSelectedEnvId('') }}
                  placeholder="https://api.example.com"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none transition-colors"
                />
                <p className="mt-1 text-xs text-muted-foreground">Base URL of the API to test against</p>
              </div>
              <button
                onClick={() => createRun.mutate()}
                disabled={createRun.isPending || !baseUrl || isRunActive}
                className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createRun.isPending ? 'Starting...' : 'Run Tests'}
              </button>
              {isRunActive && (
                <button
                  onClick={() => cancelRun.mutate()}
                  disabled={cancelRun.isPending}
                  className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cancelRun.isPending ? 'Stopping...' : 'Stop'}
                </button>
              )}
            </div>
            {createRun.isError && (
              <p className="mt-2 text-xs text-red-500">{createRun.error.message}</p>
            )}
          </>
        )}

        {tab === 'browser' && (
          <>
            <h3 className="mb-1 text-sm font-medium text-foreground">Run Browser Tests</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Enter page URLs to test. Speclyn will explore each page with AI and generate Playwright tests against your requirements.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setSelectedEnvId('') }}
                placeholder="https://yourapp.com"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none transition-colors"
              />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Page URLs <span className="text-muted-foreground">(one per line, max 10)</span></label>
              <textarea
                value={pageUrlsInput}
                onChange={(e) => setPageUrlsInput(e.target.value)}
                placeholder={"https://yourapp.com/login\nhttps://yourapp.com/dashboard\nhttps://yourapp.com/settings"}
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none transition-colors font-mono"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => createBrowserRun.mutate()}
                disabled={createBrowserRun.isPending || !pageUrlsInput.trim() || !baseUrl || isRunActive}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createBrowserRun.isPending ? 'Starting...' : 'Run Browser Tests'}
              </button>
              {isRunActive && (
                <button
                  onClick={() => cancelRun.mutate()}
                  disabled={cancelRun.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cancelRun.isPending ? 'Stopping...' : 'Stop'}
                </button>
              )}
            </div>
            {createBrowserRun.isError && (
              <p className="mt-2 text-xs text-red-500">{createBrowserRun.error.message}</p>
            )}
          </>
        )}

        {tab === 'performance' && (
          <>
            <h3 className="mb-1 text-sm font-medium text-foreground">Generate k6 Load Test</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              AI generates a k6 script covering all your endpoints. Download and run with{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">k6 run script.js</code>.
            </p>
            <div className="mb-3 flex gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Target RPS</label>
                <input
                  type="number"
                  min={1} max={10000}
                  value={k6Config.targetRps}
                  onChange={(e) => setK6Config(c => ({ ...c, targetRps: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration (seconds)</label>
                <input
                  type="number"
                  min={10} max={3600}
                  value={k6Config.durationSeconds}
                  onChange={(e) => setK6Config(c => ({ ...c, durationSeconds: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => generateK6.mutate()}
                disabled={generateK6.isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {generateK6.isPending ? 'Generating...' : 'Generate k6 Script'}
              </button>
              {k6Script && (
                <button
                  onClick={() => {
                    const blob = new Blob([k6Script], { type: 'text/javascript' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = 'speclyn-load-test.k6.js'; a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  Download Script
                </button>
              )}
            </div>
            {k6Error && <p className="mt-2 text-xs text-red-500">{k6Error}</p>}
            {k6Script && (
              <div className="mt-4 rounded-lg border border-border bg-zinc-950 p-3 overflow-auto max-h-64">
                <pre className="text-xs text-muted-foreground font-mono whitespace-pre">{k6Script.slice(0, 2000)}{k6Script.length > 2000 ? '\n...' : ''}</pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Build log */}
      {(liveSteps.length > 0 || activeRunId) && (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-foreground">Test Log</p>
              {derivedTotal > 0 && (
                <span className="text-xs text-muted-foreground">{completedCount}/{derivedTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {liveCounts.passed > 0 && <span className="text-xs text-green-600">{liveCounts.passed} passed</span>}
              {liveCounts.failed > 0 && <span className="text-xs text-red-500">{liveCounts.failed} failed</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[displayStatus] ?? STATUS_COLOR['pending']!}`}>
                {displayStatus}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {derivedTotal > 0 && (
            <div className="px-4 py-2 border-b border-border">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round((completedCount / derivedTotal) * 100)}%`,
                    background: liveCounts.failed > 0
                      ? 'linear-gradient(90deg, #22c55e 0%, #22c55e ' + Math.round((liveCounts.passed / completedCount) * 100) + '%, #ef4444 100%)'
                      : '#6366f1',
                  }}
                />
              </div>
            </div>
          )}

          {/* Indeterminate bar during generating phase with no steps yet */}
          {displayStatus === 'generating' && liveSteps.length === 0 && (
            <div className="px-4 py-2 border-b border-border">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 rounded-full bg-indigo-400 animate-pulse" />
              </div>
            </div>
          )}

          {/* SSE error */}
          {sseError && (
            <div className="px-4 py-2 bg-red-50 text-xs text-red-600 flex items-center justify-between">
              <span>{sseError}</span>
              <button onClick={() => activeRunId && void openSseStream(activeRunId)} className="underline">Retry</button>
            </div>
          )}

          {/* Steps */}
          <div className="max-h-[60vh] overflow-y-auto">
            {liveSteps.length === 0 && !sseError ? (
              <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for events...
              </div>
            ) : (
              <div className="divide-y divide-border">
                {liveSteps.map((step, i) => (
                  <div
                    key={step.testName}
                    className={`px-4 py-2.5 transition-colors ${step.errorMessage ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                    onClick={() => step.errorMessage && setExpandedStep(expandedStep === i ? null : i)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      {step.status === 'running' && (
                        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-blue-500" />
                      )}
                      {step.status === 'passed' && (
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                      )}
                      {step.status === 'failed' && (
                        <X className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground">{step.testName}</p>
                        {step.meta && <p className="text-xs text-muted-foreground">{step.meta}</p>}
                        {step.errorMessage && expandedStep !== i && (
                          <p className="mt-0.5 truncate text-xs text-red-400">{step.errorMessage}</p>
                        )}
                      </div>

                      {step.durationMs != null && (
                        <span className="shrink-0 text-xs text-muted-foreground">{step.durationMs}ms</span>
                      )}
                    </div>

                    {/* Expanded error */}
                    {expandedStep === i && step.errorMessage && (
                      <pre className="mt-2 ml-6 rounded bg-red-50 p-3 text-xs text-red-700 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                        {step.errorMessage}
                      </pre>
                    )}
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            )}
          </div>

          {/* Summary footer */}
          {runDone && activeRun && (
            <div className="flex items-center gap-4 border-t border-border px-4 py-3 bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground">
                {activeRun.totalTests} tests
              </span>
              <span className="text-xs text-green-600">{activeRun.passed} passed</span>
              <span className="text-xs text-red-500">{activeRun.failed} failed</span>
              {activeRun.coveragePercent != null && (
                <span className="text-xs text-muted-foreground">{activeRun.coveragePercent}% coverage</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {activeRun.startedAt && activeRun.completedAt
                  ? `Completed in ${formatDuration(new Date(activeRun.completedAt).getTime() - new Date(activeRun.startedAt).getTime())}`
                  : activeRun.completedAt
                    ? new Date(activeRun.completedAt).toLocaleString()
                    : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Run history */}
      {runs && runs.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Run History</p>
          <div className="divide-y divide-border rounded-xl border border-border bg-white">
            {runs.map((run) => (
              <div
                key={run.id}
                onClick={() => void selectRun(run)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                  activeRunId === run.id ? 'bg-indigo-50/50 border-l-2 border-l-indigo-400' : ''
                }`}
              >
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[run.status] ?? STATUS_COLOR['pending']!}`}>
                  {run.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {run.totalTests} tests · {run.passed} passed · {run.failed} failed
                    {run.coveragePercent != null && ` · ${run.coveragePercent}% coverage`}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground" title={new Date(run.createdAt).toLocaleString()}>
                  {formatRelative(run.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
