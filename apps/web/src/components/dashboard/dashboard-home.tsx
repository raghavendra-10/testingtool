'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface DashboardData {
  totalProjects: number
  overallPassRate: number
  activeSchedules: number
  recentRuns: Array<{
    id: string; projectId: string; projectName: string; status: string
    totalTests: number; passed: number; failed: number; coveragePercent: number | null
    createdAt: string
  }>
  recentDefects: Array<{
    id: string; projectId: string; projectName: string; title: string
    failureCategory: string; status: string; createdAt: string
  }>
}

const STATUS_DOT: Record<string, string> = {
  passed: 'bg-green-400', failed: 'bg-red-400', error: 'bg-red-400',
  generating: 'bg-amber-400', running: 'bg-blue-400', pending: 'bg-slate-300',
}

function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Mini sparkline from recent run pass rates
function Sparkline({ runs }: { runs: DashboardData['recentRuns'] }) {
  const points = runs.slice().reverse().map(r => r.totalTests > 0 ? (r.passed / r.totalTests) * 100 : 0)
  if (points.length < 2) return null
  const max = 100
  const w = 120
  const h = 32
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - (p / max) * h
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} className="text-indigo-400">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="currentColor" opacity="0.08" />
    </svg>
  )
}

export function DashboardHome() {
  const { request } = useApiClient()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => request<DashboardData>('/dashboard'),
  })

  if (isLoading) return (
    <div className="grid grid-cols-4 gap-4 auto-rows-[140px]">
      {[1,2,3,4,5,6].map(i => <div key={i} className={`animate-pulse rounded-2xl bg-slate-100 ${i <= 2 ? 'col-span-2 row-span-2' : ''}`} />)}
    </div>
  )

  if (!data) return null

  const openDefects = data.recentDefects.filter(d => d.status === 'open').length
  const avgCoverage = data.recentRuns.length > 0
    ? Math.round(data.recentRuns.reduce((s, r) => s + (r.coveragePercent ?? 0), 0) / data.recentRuns.length)
    : 0

  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>

      {/* Bento grid */}
      <div className="grid grid-cols-4 gap-4 auto-rows-[140px]">

        {/* Hero: Pass Rate — 2x2 */}
        <div className="col-span-2 row-span-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">Overall Pass Rate</p>
            <p className={`mt-2 text-5xl font-bold tracking-tight ${data.overallPassRate >= 80 ? 'text-green-600' : data.overallPassRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {data.overallPassRate}%
            </p>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-xs text-slate-400">Last {data.recentRuns.length} runs</p>
            <Sparkline runs={data.recentRuns} />
          </div>
        </div>

        {/* Projects count */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Projects</p>
          <p className="text-4xl font-bold text-slate-800">{data.totalProjects}</p>
        </div>

        {/* Active schedules */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Active Schedules</p>
          <p className="text-4xl font-bold text-indigo-600">{data.activeSchedules}</p>
        </div>

        {/* Open defects */}
        <div className={`rounded-2xl border p-5 flex flex-col justify-between ${openDefects > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Open Defects</p>
          <p className={`text-4xl font-bold ${openDefects > 0 ? 'text-red-600' : 'text-green-600'}`}>{openDefects}</p>
        </div>

        {/* Avg coverage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Avg Coverage</p>
          <div>
            <p className="text-4xl font-bold text-indigo-600">{avgCoverage}%</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${avgCoverage}%` }} />
            </div>
          </div>
        </div>

        {/* Recent runs — 2x2 */}
        <div className="col-span-2 row-span-2 rounded-2xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Recent Runs</p>
            <a href="/projects" className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors">View all</a>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {data.recentRuns.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">No runs yet</div>
            ) : data.recentRuns.map(run => (
              <a key={run.id} href={`/projects/${run.projectId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[run.status] ?? 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 truncate">{run.projectName}</p>
                  <p className="text-xs text-slate-400">{run.passed}/{run.totalTests} passed</p>
                </div>
                <span className="text-xs text-slate-400">{timeAgo(run.createdAt)}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Recent defects — 2x2 */}
        <div className="col-span-2 row-span-2 rounded-2xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Recent Defects</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {data.recentDefects.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-2xl">&#10003;</p>
                  <p className="mt-1 text-xs text-slate-400">All clear</p>
                </div>
              </div>
            ) : data.recentDefects.map(d => (
              <a key={d.id} href={`/projects/${d.projectId}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 truncate">{d.title}</p>
                  <p className="text-xs text-slate-400">{d.projectName} · {d.failureCategory?.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-xs text-slate-400 mt-0.5">{timeAgo(d.createdAt)}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
