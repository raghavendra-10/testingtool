'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CodeAnalysisRun {
  id: string
  status: string
  language: string
  totalFiles: number
  totalIssues: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  failureReason: string | null
  createdAt: string
  completedAt: string | null
}

interface CodeIssue {
  id: string
  category: string
  severity: string
  title: string
  description: string
  filePath: string | null
  lineNumber: number | null
  codeSnippet: string | null
  recommendation: string
  ruleId: string | null
}

interface SchemaAnalysisRun {
  id: string
  status: string
  sourceType: string
  totalTables: number
  totalIssues: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  failureReason: string | null
  createdAt: string
  completedAt: string | null
}

interface SchemaIssue {
  id: string
  category: string
  severity: string
  tableName: string | null
  columnName: string | null
  title: string
  description: string
  recommendation: string
  sqlSnippet: string | null
  ruleId: string | null
}

interface CodeRunDetail extends CodeAnalysisRun { issues: CodeIssue[] }
interface SchemaRunDetail extends SchemaAnalysisRun { issues: SchemaIssue[] }

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-blue-100 text-blue-700 border-blue-200',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-blue-400',
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-muted text-muted-foreground',
  analyzing: 'bg-amber-50 text-amber-600',
  completed: 'bg-green-50 text-green-600',
  error:     'bg-red-50 text-red-600',
}

const CATEGORY_LABELS: Record<string, string> = {
  code_structure:     'Code Structure',
  api_pattern:        'API Pattern',
  auth_security:      'Auth & Security',
  sql_security:       'SQL Security',
  hardcoded_secret:   'Hardcoded Secret',
  input_validation:   'Input Validation',
  error_handling:     'Error Handling',
  logging:            'Logging',
  deprecated_usage:   'Deprecated Usage',
  naming_convention:  'Naming Convention',
  transaction_handling: 'Transactions',
  data_exposure:      'Data Exposure',
  encryption:         'Encryption',
  multi_tenant:       'Multi-Tenant',
  hipaa:              'HIPAA',
  table_structure:    'Table Structure',
  column_type:        'Column Type',
  missing_constraint: 'Missing Constraint',
  missing_index:      'Missing Index',
  missing_fk:         'Missing FK',
  missing_pk:         'Missing PK',
  redundant_column:   'Redundant Column',
  cascade_rule:       'Cascade Rule',
  soft_delete:        'Soft Delete',
  data_validation:    'Data Validation',
  referential_integrity: 'Referential Integrity',
  multi_tenant_isolation: 'Multi-Tenant Isolation',
  hipaa_field:        'HIPAA Field',
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AnalysisPanel({ projectId }: { projectId: string }) {
  const { request } = useApiClient()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<'code' | 'schema'>('code')
  const [language, setLanguage] = useState('java')
  const [schemaInput, setSchemaInput] = useState('')
  const [selectedCodeRun, setSelectedCodeRun] = useState<string | null>(null)
  const [selectedSchemaRun, setSelectedSchemaRun] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const ANALYSIS_TYPES = [
    'code_structure', 'api_pattern', 'auth_security', 'sql_security',
    'hardcoded_secret', 'input_validation', 'error_handling', 'logging',
    'deprecated_usage', 'naming_convention', 'transaction_handling',
    'data_exposure', 'encryption', 'multi_tenant', 'hipaa',
  ]

  // ─── Queries ────────────────────────────────────────────────────
  const { data: codeRuns } = useQuery<CodeAnalysisRun[]>({
    queryKey: ['code-analysis', projectId],
    queryFn: () => request<CodeAnalysisRun[]>(`/projects/${projectId}/code-analysis`),
    refetchInterval: 10_000,
  })

  const { data: schemaRuns } = useQuery<SchemaAnalysisRun[]>({
    queryKey: ['schema-analysis', projectId],
    queryFn: () => request<SchemaAnalysisRun[]>(`/projects/${projectId}/schema-analysis`),
    refetchInterval: 10_000,
  })

  const { data: codeRunDetail } = useQuery<CodeRunDetail>({
    queryKey: ['code-analysis-detail', projectId, selectedCodeRun],
    queryFn: () => request<CodeRunDetail>(`/projects/${projectId}/code-analysis/${selectedCodeRun}`),
    enabled: !!selectedCodeRun,
  })

  const { data: schemaRunDetail } = useQuery<SchemaRunDetail>({
    queryKey: ['schema-analysis-detail', projectId, selectedSchemaRun],
    queryFn: () => request<SchemaRunDetail>(`/projects/${projectId}/schema-analysis/${selectedSchemaRun}`),
    enabled: !!selectedSchemaRun,
  })

  // ─── Mutations ──────────────────────────────────────────────────
  const triggerCodeAnalysis = useMutation({
    mutationFn: () => request<CodeAnalysisRun>(`/projects/${projectId}/code-analysis`, {
      method: 'POST',
      body: JSON.stringify({ language, analysisTypes: ANALYSIS_TYPES }),
    }),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['code-analysis', projectId] })
      setSelectedCodeRun(run.id)
    },
  })

  const triggerSchemaAnalysis = useMutation({
    mutationFn: () => request<SchemaAnalysisRun>(`/projects/${projectId}/schema-analysis`, {
      method: 'POST',
      body: JSON.stringify({ schemaContent: schemaInput }),
    }),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['schema-analysis', projectId] })
      setSelectedSchemaRun(run.id)
    },
  })

  // ─── Filter issues ─────────────────────────────────────────────
  function filterIssues<T extends { severity: string; category: string }>(issues: T[]): T[] {
    return issues.filter(i => {
      if (severityFilter !== 'all' && i.severity !== severityFilter) return false
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false
      return true
    })
  }

  // Get all unique categories from current issues
  const codeCategories = codeRunDetail?.issues.map(i => i.category).filter((v, i, a) => a.indexOf(v) === i) ?? []
  const schemaCategories = schemaRunDetail?.issues.map(i => i.category).filter((v, i, a) => a.indexOf(v) === i) ?? []

  return (
    <div className="space-y-6">
      {/* Tab toggle */}
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit">
          <button
            onClick={() => { setTab('code'); setSeverityFilter('all'); setCategoryFilter('all') }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'code' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Code Analysis
          </button>
          <button
            onClick={() => { setTab('schema'); setSeverityFilter('all'); setCategoryFilter('all') }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'schema' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Schema Analysis
          </button>
        </div>

        {/* ─── Code Analysis Tab ──────────────────────────────────── */}
        {tab === 'code' && (
          <>
            <h3 className="mb-1 text-sm font-medium text-foreground">Analyze Source Code</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Analyzes your connected repository for code structure, security, API patterns, SQL issues, multi-tenant isolation, and HIPAA compliance.
            </p>
            <div className="mb-3 flex gap-3 items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
                >
                  <option value="java">Java</option>
                  <option value="python">Python</option>
                  <option value="csharp">C#</option>
                  <option value="go">Go</option>
                  <option value="kotlin">Kotlin</option>
                  <option value="typescript">TypeScript</option>
                  <option value="javascript">JavaScript</option>
                </select>
              </div>
              <button
                onClick={() => triggerCodeAnalysis.mutate()}
                disabled={triggerCodeAnalysis.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {triggerCodeAnalysis.isPending ? 'Starting...' : 'Analyze Code'}
              </button>
            </div>
            {triggerCodeAnalysis.isError && (
              <p className="text-xs text-red-500">{triggerCodeAnalysis.error.message}</p>
            )}

            {/* Code analysis run history */}
            {codeRuns && codeRuns.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis Runs</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {codeRuns.map((run) => (
                    <div
                      key={run.id}
                      onClick={() => setSelectedCodeRun(run.id)}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                        selectedCodeRun === run.id ? 'bg-indigo-50/50 border-l-2 border-l-indigo-400' : ''
                      }`}
                    >
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[run.status] ?? STATUS_BADGE['pending']!}`}>
                        {run.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {run.language.toUpperCase()} · {run.totalFiles} files · {run.totalIssues} issues
                        </p>
                        {run.totalIssues > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {run.criticalCount > 0 && <span className="text-red-500">{run.criticalCount} critical</span>}
                            {run.highCount > 0 && <span className="ml-1 text-orange-500">{run.highCount} high</span>}
                            {run.mediumCount > 0 && <span className="ml-1 text-amber-500">{run.mediumCount} medium</span>}
                            {run.lowCount > 0 && <span className="ml-1 text-blue-400">{run.lowCount} low</span>}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatRelative(run.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Code issues detail */}
            {codeRunDetail && codeRunDetail.issues.length > 0 && (
              <IssueList
                issues={filterIssues(codeRunDetail.issues)}
                allIssues={codeRunDetail.issues}
                categories={codeCategories}
                severityFilter={severityFilter}
                categoryFilter={categoryFilter}
                onSeverityChange={setSeverityFilter}
                onCategoryChange={setCategoryFilter}
                renderIssue={(issue: CodeIssue) => (
                  <div key={issue.id} className="border-b border-border px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[issue.severity] ?? 'bg-muted'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${SEVERITY_COLORS[issue.severity] ?? ''}`}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {CATEGORY_LABELS[issue.category] ?? issue.category}
                          </span>
                          {issue.ruleId && (
                            <span className="text-[10px] text-muted-foreground font-mono">{issue.ruleId}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground">{issue.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                        {issue.filePath && (
                          <p className="mt-1 text-xs text-muted-foreground font-mono">
                            {issue.filePath}{issue.lineNumber ? `:${issue.lineNumber}` : ''}
                          </p>
                        )}
                        {issue.codeSnippet && (
                          <pre className="mt-2 rounded bg-zinc-950 p-2 text-xs text-muted-foreground font-mono overflow-x-auto max-h-24">
                            {issue.codeSnippet}
                          </pre>
                        )}
                        <div className="mt-2 rounded bg-green-50 border border-green-200 p-2">
                          <p className="text-xs text-green-700">
                            <span className="font-medium">Recommendation:</span> {issue.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
            {codeRunDetail && codeRunDetail.issues.length === 0 && codeRunDetail.status === 'completed' && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-sm text-green-700 font-medium">No issues found!</p>
                <p className="text-xs text-green-600 mt-1">Your code passed all {ANALYSIS_TYPES.length} analysis checks.</p>
              </div>
            )}
          </>
        )}

        {/* ─── Schema Analysis Tab ────────────────────────────────── */}
        {tab === 'schema' && (
          <>
            <h3 className="mb-1 text-sm font-medium text-foreground">Analyze Database Schema</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Paste SQL CREATE TABLE statements or migration scripts. Analyzes table structure, constraints, indexes, naming, multi-tenant isolation, and HIPAA fields.
            </p>
            <div className="mb-3">
              <textarea
                value={schemaInput}
                onChange={(e) => setSchemaInput(e.target.value)}
                placeholder={`CREATE TABLE patients (\n  id UUID PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  ssn VARCHAR(11),\n  clinic_id UUID REFERENCES clinics(id),\n  ...\n);`}
                rows={8}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none font-mono"
              />
            </div>
            <button
              onClick={() => triggerSchemaAnalysis.mutate()}
              disabled={triggerSchemaAnalysis.isPending || schemaInput.trim().length < 10}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
            >
              {triggerSchemaAnalysis.isPending ? 'Analyzing...' : 'Analyze Schema'}
            </button>
            {triggerSchemaAnalysis.isError && (
              <p className="mt-2 text-xs text-red-500">{triggerSchemaAnalysis.error.message}</p>
            )}

            {/* Schema run history */}
            {schemaRuns && schemaRuns.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Schema Runs</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {schemaRuns.map((run) => (
                    <div
                      key={run.id}
                      onClick={() => setSelectedSchemaRun(run.id)}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                        selectedSchemaRun === run.id ? 'bg-violet-50/50 border-l-2 border-l-violet-400' : ''
                      }`}
                    >
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[run.status] ?? STATUS_BADGE['pending']!}`}>
                        {run.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {run.sourceType} · {run.totalTables} tables · {run.totalIssues} issues
                        </p>
                        {run.totalIssues > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {run.criticalCount > 0 && <span className="text-red-500">{run.criticalCount} critical</span>}
                            {run.highCount > 0 && <span className="ml-1 text-orange-500">{run.highCount} high</span>}
                            {run.mediumCount > 0 && <span className="ml-1 text-amber-500">{run.mediumCount} medium</span>}
                            {run.lowCount > 0 && <span className="ml-1 text-blue-400">{run.lowCount} low</span>}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatRelative(run.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schema issues detail */}
            {schemaRunDetail && schemaRunDetail.issues.length > 0 && (
              <IssueList
                issues={filterIssues(schemaRunDetail.issues)}
                allIssues={schemaRunDetail.issues}
                categories={schemaCategories}
                severityFilter={severityFilter}
                categoryFilter={categoryFilter}
                onSeverityChange={setSeverityFilter}
                onCategoryChange={setCategoryFilter}
                renderIssue={(issue: SchemaIssue) => (
                  <div key={issue.id} className="border-b border-border px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[issue.severity] ?? 'bg-muted'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${SEVERITY_COLORS[issue.severity] ?? ''}`}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {CATEGORY_LABELS[issue.category] ?? issue.category}
                          </span>
                          {issue.ruleId && (
                            <span className="text-[10px] text-muted-foreground font-mono">{issue.ruleId}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground">{issue.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                        {issue.tableName && (
                          <p className="mt-1 text-xs text-muted-foreground font-mono">
                            Table: {issue.tableName}{issue.columnName ? ` → ${issue.columnName}` : ''}
                          </p>
                        )}
                        {issue.sqlSnippet && (
                          <pre className="mt-2 rounded bg-zinc-950 p-2 text-xs text-muted-foreground font-mono overflow-x-auto max-h-24">
                            {issue.sqlSnippet}
                          </pre>
                        )}
                        <div className="mt-2 rounded bg-green-50 border border-green-200 p-2">
                          <p className="text-xs text-green-700">
                            <span className="font-medium">Recommendation:</span> {issue.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
            {schemaRunDetail && schemaRunDetail.issues.length === 0 && schemaRunDetail.status === 'completed' && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-sm text-green-700 font-medium">No schema issues found!</p>
                <p className="text-xs text-green-600 mt-1">Your database schema passed all analysis checks.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Reusable issue list component with filters ─────────────────────────────

function IssueList<T extends { severity: string; category: string }>({
  issues,
  allIssues,
  categories,
  severityFilter,
  categoryFilter,
  onSeverityChange,
  onCategoryChange,
  renderIssue,
}: {
  issues: T[]
  allIssues: T[]
  categories: string[]
  severityFilter: string
  categoryFilter: string
  onSeverityChange: (v: string) => void
  onCategoryChange: (v: string) => void
  renderIssue: (issue: T) => React.ReactNode
}) {
  return (
    <div className="mt-4">
      {/* Summary bar */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Issues ({issues.length}{issues.length !== allIssues.length ? ` of ${allIssues.length}` : ''})
        </p>
        <div className="flex gap-2">
          <select
            value={severityFilter}
            onChange={(e) => onSeverityChange(e.target.value)}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground focus:border-indigo-400 focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground focus:border-indigo-400 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Issues */}
      <div className="rounded-xl border border-border bg-white overflow-hidden max-h-[65vh] overflow-y-auto">
        {issues.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No issues match your filters.
          </div>
        ) : (
          issues.map(renderIssue)
        )}
      </div>
    </div>
  )
}
