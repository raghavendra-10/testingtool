'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface RepoConnection {
  id: string; platform: string; repoUrl: string; branch: string; status: string
  lastAnalyzedAt: string | null; endpointCount: number | null
  stackDetected: string | null; errorMessage: string | null
}

interface OAuthRepo {
  name: string; cloneUrl: string; branch: string; private: boolean
}

const PLATFORM_COLOR: Record<string, string> = {
  github: 'bg-slate-900 text-white', bitbucket: 'bg-blue-600 text-white', gitlab: 'bg-orange-500 text-white',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-500', analyzing: 'bg-amber-50 text-amber-600',
  connected: 'bg-green-50 text-green-600', error: 'bg-red-50 text-red-600',
}
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function RepositoryPanel({ projectId }: { projectId: string }) {
  const { request } = useApiClient()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const oauthSuccess = searchParams.get('oauth') === 'success'
  const oauthKey = searchParams.get('key')
  const oauthPlatform = searchParams.get('platform')

  const [showManual, setShowManual] = useState(false)
  const [manualPlatform, setManualPlatform] = useState<'github' | 'bitbucket' | 'gitlab'>('github')
  const [manualUrl, setManualUrl] = useState('')
  const [manualBranch, setManualBranch] = useState('main')
  const [manualToken, setManualToken] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editToken, setEditToken] = useState('')
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null)

  const { data: repos, isLoading } = useQuery<RepoConnection[]>({
    queryKey: ['repositories', projectId],
    queryFn: () => request<RepoConnection[]>(`/projects/${projectId}/repositories`),
  })

  const { data: oauthRepos, isLoading: loadingOauthRepos } = useQuery<OAuthRepo[]>({
    queryKey: ['oauth-repos', oauthKey],
    queryFn: () => request<OAuthRepo[]>(`/oauth/repos?key=${oauthKey}`),
    enabled: !!oauthKey && oauthSuccess,
  })

  const connectOauth = useMutation({
    mutationFn: (repo: OAuthRepo) => request('/oauth/connect', {
      method: 'POST',
      body: JSON.stringify({ key: oauthKey, projectId, repoUrl: repo.cloneUrl, branch: repo.branch }),
    }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['repositories', projectId] }),
  })

  const connectManual = useMutation({
    mutationFn: () => request(`/projects/${projectId}/repositories`, {
      method: 'POST',
      body: JSON.stringify({ platform: manualPlatform, repoUrl: manualUrl, branch: manualBranch, accessToken: manualToken }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['repositories', projectId] })
      setShowManual(false); setManualUrl(''); setManualToken('')
    },
  })

  const updateRepo = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/repositories/${id}`, {
      method: 'PATCH', body: JSON.stringify({ accessToken: editToken || undefined }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['repositories', projectId] })
      setEditingId(null); setEditToken('')
    },
  })

  const reanalyze = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/repositories/${id}/reanalyze`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['repositories', projectId] }),
  })

  const disconnect = useMutation({
    mutationFn: (id: string) => request(`/projects/${projectId}/repositories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDisconnectId(null)
      void queryClient.invalidateQueries({ queryKey: ['repositories', projectId] })
    },
  })

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100"/>)}</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-slate-700">Connected Repositories</h2>
        <p className="text-xs text-slate-400">Connect with OAuth or paste a token manually</p>
      </div>

      {/* OAuth repo picker */}
      {oauthSuccess && oauthKey && (
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="text-green-500" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-sm font-medium text-green-800">{oauthPlatform === 'github' ? 'GitHub' : 'Bitbucket'} connected! Select repos to analyze:</p>
          </div>
          {loadingOauthRepos ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-green-100"/>)}</div>
          ) : oauthRepos && oauthRepos.length > 0 ? (
            <div className="divide-y divide-green-100 rounded-xl border border-green-200 bg-white max-h-64 overflow-y-auto">
              {oauthRepos.map(repo => (
                <div key={repo.cloneUrl} className="flex items-center justify-between px-4 py-2.5 hover:bg-green-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{repo.name}</p>
                    <p className="text-xs text-slate-400">{repo.branch} · {repo.private ? 'private' : 'public'}</p>
                  </div>
                  <button onClick={() => connectOauth.mutate(repo)} disabled={connectOauth.isPending}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors">
                    Connect
                  </button>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-400">No repositories found.</p>}
        </div>
      )}

      {/* Connect buttons */}
      {!oauthSuccess && (
        <div className="flex flex-wrap gap-3">
          <a href={`${API_BASE}/api/v1/oauth/github/authorize?projectId=${projectId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Connect GitHub
          </a>
          <a href={`${API_BASE}/api/v1/oauth/bitbucket/authorize?projectId=${projectId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M.78 1.02a.5.5 0 00-.49.59l2.18 13.2a.68.68 0 00.66.57h10.04a.5.5 0 00.5-.42L15.71 1.6a.5.5 0 00-.49-.59H.78zM9.68 10.7H6.35L5.57 6.3h4.99l-.88 4.4z"/></svg>
            Connect Bitbucket
          </a>
          <button onClick={() => setShowManual(!showManual)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            {showManual ? 'Cancel' : 'Manual Token'}
          </button>
        </div>
      )}

      {/* Manual form */}
      {showManual && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={manualPlatform} onChange={e => setManualPlatform(e.target.value as typeof manualPlatform)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none">
              <option value="github">GitHub</option><option value="bitbucket">Bitbucket</option><option value="gitlab">GitLab</option>
            </select>
            <input value={manualBranch} onChange={e => setManualBranch(e.target.value)} placeholder="Branch (main)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none" />
          </div>
          <input value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://github.com/owner/repo.git"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none" />
          <input value={manualToken} onChange={e => setManualToken(e.target.value)} type="password" placeholder="Personal access token"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none" />
          <button onClick={() => connectManual.mutate()} disabled={!manualUrl || !manualToken || connectManual.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {connectManual.isPending ? 'Connecting...' : 'Connect & Analyze'}
          </button>
        </div>
      )}

      {/* Connected repos */}
      {repos && repos.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {repos.map(repo => {
            const stack = repo.stackDetected ? JSON.parse(repo.stackDetected) as { runtime: string; framework: string; language: string } : null
            return (
              <div key={repo.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PLATFORM_COLOR[repo.platform] ?? 'bg-slate-100'}`}>{repo.platform}</span>
                      <p className="text-sm font-medium text-slate-800 truncate">{repo.repoUrl.replace(/https?:\/\/[^/]+\//, '')}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {repo.branch}{repo.endpointCount ? ` · ${repo.endpointCount} endpoints` : ''}{stack ? ` · ${stack.framework}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[repo.status] ?? ''}`}>{repo.status}</span>
                    {repo.status === 'error' && <button onClick={() => { setEditingId(repo.id); setEditToken('') }} className="text-xs text-amber-600 hover:underline">Fix & Retry</button>}
                    {repo.status === 'connected' && <button onClick={() => reanalyze.mutate(repo.id)} className="text-xs text-indigo-600 hover:underline">Re-analyze</button>}
                    {confirmDisconnectId === repo.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Disconnect?</span>
                        <button
                          onClick={() => disconnect.mutate(repo.id)}
                          disabled={disconnect.isPending}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          {disconnect.isPending ? 'Removing...' : 'Yes'}
                        </button>
                        <button onClick={() => setConfirmDisconnectId(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDisconnectId(repo.id)} className="text-xs text-red-500 hover:underline">
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
                {repo.status === 'error' && repo.errorMessage && editingId !== repo.id && (
                  <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">{repo.errorMessage}</p>
                )}
                {editingId === repo.id && (
                  <div className="mt-3 flex gap-2">
                    <input value={editToken} onChange={e => setEditToken(e.target.value)} type="password" placeholder="New access token"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none" />
                    <button onClick={() => updateRepo.mutate(repo.id)} disabled={!editToken || updateRepo.isPending}
                      className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
                      {updateRepo.isPending ? 'Retrying...' : 'Retry'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancel</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
