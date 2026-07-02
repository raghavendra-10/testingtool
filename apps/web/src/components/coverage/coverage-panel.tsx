'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface CoverageMatrix {
  summary: {
    total: number
    covered: number
    failing: number
    notTested: number
    noTests: number
    coveragePercent: number
  }
  matrix: Array<{
    requirement: {
      id: string
      title: string
      type: string | null
      priority: string
      module: string | null
    }
    status: 'covered' | 'failing' | 'not_tested' | 'no_tests'
    testCount: number
    passedCount: number
  }>
}

interface GapData {
  total: number
  gapCount: number
  gaps: Array<{
    id: string
    title: string
    description: string | null
    type: string | null
    priority: string
    module: string | null
  }>
}

const STATUS_CONFIG = {
  covered:    { label: 'Covered',    color: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  failing:    { label: 'Failing',    color: 'bg-red-50 text-red-600',    dot: 'bg-red-500' },
  not_tested: { label: 'Not tested', color: 'bg-amber-50 text-amber-600', dot: 'bg-amber-400' },
  no_tests:   { label: 'No tests',   color: 'bg-muted text-muted-foreground', dot: 'bg-muted' },
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   'text-red-600',
  medium: 'text-amber-600',
  low:    'text-muted-foreground',
}

export function CoveragePanel({ projectId }: { projectId: string }) {
  const { request } = useApiClient()

  const { data, isLoading } = useQuery<CoverageMatrix>({
    queryKey: ['coverage', projectId],
    queryFn: () => request<CoverageMatrix>(`/projects/${projectId}/coverage`),
  })

  const { data: gaps } = useQuery<GapData>({
    queryKey: ['gaps', projectId],
    queryFn: () => request<GapData>(`/projects/${projectId}/gaps`),
  })

  interface TrendPoint { runId: string; date: string; passRate: number; coveragePercent: number; totalTests: number; passed: number; failed: number }
  interface RegressionData { regressions: Array<{ testId: string; testName: string }>; flaky: Array<{ testId: string; testName: string }> }

  const { data: trends } = useQuery<{ points: TrendPoint[] }>({
    queryKey: ['trends', projectId],
    queryFn: () => request<{ points: TrendPoint[] }>(`/projects/${projectId}/trends`),
  })

  const { data: regressionData } = useQuery<RegressionData>({
    queryKey: ['regressions', projectId],
    queryFn: () => request<RegressionData>(`/projects/${projectId}/regressions`),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
    </div>
  )

  if (!data || data.matrix.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="mb-3 text-muted-foreground" width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 4a12 12 0 1 1 0 24A12 12 0 0 1 16 4z" stroke="currentColor" strokeWidth="2"/>
        <path d="M16 10v8M16 21v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p className="text-sm text-muted-foreground">No coverage data yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">Extract requirements and run tests to see coverage.</p>
    </div>
  )

  const { summary } = data

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Coverage', value: `${summary.coveragePercent}%`, color: 'text-indigo-600' },
          { label: 'Covered',  value: summary.covered,  color: 'text-green-600' },
          { label: 'Failing',  value: summary.failing,  color: 'text-red-600' },
          { label: 'No tests', value: summary.noTests,  color: 'text-muted-foreground' },
          { label: 'Gaps',     value: gaps?.gapCount ?? 0, color: gaps && gaps.gapCount > 0 ? 'text-orange-600' : 'text-green-600' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-white p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div className="rounded-xl border border-border bg-white px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{summary.covered} of {summary.total} requirements covered</p>
          <p className="text-xs font-medium text-indigo-600">{summary.coveragePercent}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${summary.coveragePercent}%` }}
          />
        </div>
      </div>

      {/* Trends chart */}
      {trends && trends.points.length > 1 && (
        <div className="rounded-xl border border-border bg-white px-5 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Pass Rate Trend</p>
          <div className="flex items-end gap-1 h-24">
            {trends.points.map((p, i) => (
              <div key={p.runId} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t transition-all ${p.passRate === 100 ? 'bg-green-400' : p.passRate > 50 ? 'bg-indigo-400' : 'bg-red-400'}`}
                  style={{ height: `${Math.max(p.passRate, 2)}%` }}
                  title={`${p.passRate}% pass rate · ${p.passed}/${p.totalTests} · ${new Date(p.date).toLocaleDateString()}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{trends.points.length > 0 ? new Date(trends.points[0]!.date).toLocaleDateString() : ''}</span>
            <span>Latest</span>
          </div>
        </div>
      )}

      {/* Regressions & flaky tests */}
      {regressionData && (regressionData.regressions.length > 0 || regressionData.flaky.length > 0) && (
        <div className="space-y-3">
          {regressionData.regressions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-red-500">
                Regressions ({regressionData.regressions.length})
              </p>
              <div className="divide-y divide-red-100 rounded-xl border border-red-200 bg-red-50/30">
                {regressionData.regressions.map((r) => (
                  <div key={r.testId} className="flex items-center gap-2 px-4 py-2.5">
                    <svg className="shrink-0 text-red-500" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v6M6 9v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <p className="text-xs text-foreground">{r.testName}</p>
                    <span className="ml-auto text-[10px] text-red-400">was passing</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {regressionData.flaky.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-500">
                Flaky Tests ({regressionData.flaky.length})
              </p>
              <div className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-amber-50/30">
                {regressionData.flaky.map((f) => (
                  <div key={f.testId} className="flex items-center gap-2 px-4 py-2.5">
                    <svg className="shrink-0 text-amber-500" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
                    </svg>
                    <p className="text-xs text-foreground">{f.testName}</p>
                    <span className="ml-auto text-[10px] text-amber-400">inconsistent</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gap analysis */}
      {gaps && gaps.gapCount > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-orange-500">
            Gap Analysis — {gaps.gapCount} requirements without test coverage
          </p>
          <div className="divide-y divide-orange-100 rounded-xl border border-orange-200 bg-orange-50/30">
            {gaps.gaps.map((gap) => (
              <div key={gap.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-orange-50">
                <svg className="shrink-0 text-orange-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v6M6 9v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{gap.title}</p>
                  {gap.description && <p className="truncate text-xs text-muted-foreground">{gap.description}</p>}
                </div>
                <span className={`shrink-0 text-xs font-medium ${PRIORITY_COLOR[gap.priority] ?? 'text-muted-foreground'}`}>
                  {gap.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirements Matrix */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Requirements Matrix</p>
        <div className="divide-y divide-border rounded-xl border border-border bg-white">
          {data.matrix.map(({ requirement: req, status, testCount, passedCount }) => {
            const cfg = STATUS_CONFIG[status]
            return (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{req.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {req.module || req.type || 'functional'}
                    {testCount > 0 && ` · ${passedCount}/${testCount} tests passing`}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-medium ${PRIORITY_COLOR[req.priority] ?? 'text-muted-foreground'}`}>
                  {req.priority}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
