'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface Requirement {
  id: string
  title: string
  description: string | null
  type: string | null
  priority: string
  status: string
  sourceSection: string | null
  createdAt: string
}

interface SearchResult {
  id: string
  title: string
  description: string | null
  type: string | null
  priority: string
  status: string
  similarity: number
}

interface DuplicatePair {
  id: string
  similarity: number
  is_duplicate: string
  explanation: string
  suggested_action: string
  a_id: string; a_title: string; a_desc: string | null
  b_id: string; b_title: string; b_desc: string | null
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   'bg-red-50 text-red-600',
  medium: 'bg-amber-50 text-amber-600',
  low:    'bg-slate-100 text-slate-500',
}

export function RequirementList({ projectId }: { projectId: string }) {
  const { request } = useApiClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)

  const { data: reqs, isLoading } = useQuery<Requirement[]>({
    queryKey: ['requirements', projectId],
    queryFn: () => request<Requirement[]>(`/projects/${projectId}/requirements`),
  })

  const { data: duplicates } = useQuery<DuplicatePair[]>({
    queryKey: ['requirement-duplicates', projectId],
    queryFn: () => request<DuplicatePair[]>(`/projects/${projectId}/requirements/duplicates`),
    enabled: !!reqs && reqs.length > 0,
  })

  async function handleSearch() {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setIsSearching(true)
    try {
      const results = await request<SearchResult[]>(`/projects/${projectId}/requirements/search?q=${encodeURIComponent(searchQuery)}`)
      setSearchResults(results)
    } catch { setSearchResults(null) }
    setIsSearching(false)
  }

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
    </div>
  )

  if (!reqs || reqs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="mb-3 text-slate-300" width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M8 6h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 12h8M12 16h6M12 20h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p className="text-sm text-slate-500">No requirements extracted yet.</p>
      <p className="mt-1 text-xs text-slate-400">Upload a spec document (SRS, PRD) to extract requirements.</p>
    </div>
  )

  const grouped = reqs.reduce<Record<string, Requirement[]>>((acc, r) => {
    const type = r.type ?? 'functional'
    if (!acc[type]) acc[type] = []
    acc[type]!.push(r)
    return acc
  }, {})

  const displayResults = searchResults ?? reqs

  return (
    <div>
      {/* Header with search */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="shrink-0 text-sm font-medium text-slate-700">
          Requirements
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
            {reqs.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null) }}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              placeholder="Semantic search..."
              className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none transition-colors"
            />
            <svg className="absolute left-2.5 top-2 text-slate-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <button
            onClick={() => void handleSearch()}
            disabled={isSearching || !searchQuery.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
          {searchResults && (
            <button
              onClick={() => { setSearchResults(null); setSearchQuery('') }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {searchResults && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-indigo-500">
            Search results for "{searchQuery}" ({searchResults.length})
          </p>
          <div className="divide-y divide-slate-100 rounded-xl border border-indigo-200 bg-white">
            {searchResults.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">No matching requirements found.</div>
            ) : searchResults.map((r) => (
              <div key={r.id} className="px-4 py-3 transition-colors hover:bg-indigo-50/30">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800">{r.title}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                      {Math.round((r.similarity ?? 0) * 100)}%
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[r.priority] ?? 'bg-slate-100 text-slate-500'}`}>
                      {r.priority}
                    </span>
                  </div>
                </div>
                {r.description && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{r.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate warnings */}
      {!searchResults && duplicates && duplicates.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-600">
            Potential Duplicates ({duplicates.length})
          </p>
          <div className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-amber-50/50">
            {duplicates.map((d) => (
              <div key={d.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700">
                      <span className="font-medium">{d.a_title}</span>
                      <span className="mx-2 text-slate-400">vs</span>
                      <span className="font-medium">{d.b_title}</span>
                    </p>
                    {d.explanation && <p className="mt-1 text-xs text-slate-500">{d.explanation}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {Math.round(d.similarity * 100)}% similar
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.suggested_action === 'merge' ? 'bg-red-50 text-red-600' :
                      d.suggested_action === 'review' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-50 text-green-600'
                    }`}>
                      {d.suggested_action.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All requirements (grouped by type) */}
      {!searchResults && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                {type.replace('_', ' ')}
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {items.map((req) => (
                  <div key={req.id} className="px-4 py-3 transition-colors hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">{req.title}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[req.priority] ?? 'bg-slate-100 text-slate-500'}`}>
                          {req.priority}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                          {req.status}
                        </span>
                      </div>
                    </div>
                    {req.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{req.description}</p>
                    )}
                    {req.sourceSection && (
                      <p className="mt-1 text-xs text-slate-400">§ {req.sourceSection}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
