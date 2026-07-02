'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApiClient } from '@/hooks/use-api-client'
import { useAuth } from '@clerk/nextjs'

type Step = 1 | 2 | 3 | 4 | 5

interface SpecItem {
  id: string
  type: 'file' | 'url' | 'text'
  name: string
  content?: string  // for text
  url?: string      // for url
  file?: File       // for file
  urlType?: 'auto' | 'swagger' | 'postman'
  status: 'pending' | 'uploading' | 'done' | 'error'
}

interface RepoItem {
  id: string
  platform: 'github' | 'bitbucket' | 'gitlab'
  repoUrl: string
  branch: string
  token: string
  status: 'pending' | 'connecting' | 'done' | 'error'
}

interface CredItem {
  id: string
  name: string
  type: string
  value: string
}

interface EnvItem {
  id: string
  name: string
  baseUrl: string
}

const STEPS = [
  { num: 1, label: 'Project Info' },
  { num: 2, label: 'Spec Documents' },
  { num: 3, label: 'Repositories' },
  { num: 4, label: 'Credentials' },
  { num: 5, label: 'Review & Launch' },
]

let nextId = 0
function uid() { return `item-${++nextId}` }

export function SetupWizard() {
  const router = useRouter()
  const { request } = useApiClient()
  const { getToken } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [launching, setLaunching] = useState(false)

  // Step 1
  const [projectName, setProjectName] = useState('')
  const [projectDesc, setProjectDesc] = useState('')

  // Step 2
  const [specs, setSpecs] = useState<SpecItem[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [urlType, setUrlType] = useState<'auto' | 'swagger' | 'postman'>('auto')
  const [textName, setTextName] = useState('')
  const [textContent, setTextContent] = useState('')

  // Step 3
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [repoPlatform, setRepoPlatform] = useState<'github' | 'bitbucket' | 'gitlab'>('github')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoBranch, setRepoBranch] = useState('main')
  const [repoToken, setRepoToken] = useState('')
  const [showManual, setShowManual] = useState(false)

  // Step 4
  const [creds, setCreds] = useState<CredItem[]>([])
  const [credName, setCredName] = useState('')
  const [credType, setCredType] = useState('bearer')
  const [credValue, setCredValue] = useState('')
  const [envs, setEnvs] = useState<EnvItem[]>([])
  const [envName, setEnvName] = useState('')
  const [envBaseUrl, setEnvBaseUrl] = useState('')

  function addFiles(files: FileList | null) {
    if (!files) return
    const items: SpecItem[] = Array.from(files).map(f => ({
      id: uid(), type: 'file', name: f.name, file: f, status: 'pending',
    }))
    setSpecs(prev => [...prev, ...items])
  }

  function addUrl() {
    if (!urlInput) return
    setSpecs(prev => [...prev, { id: uid(), type: 'url', name: urlInput, url: urlInput, urlType, status: 'pending' }])
    setUrlInput('')
  }

  function addText() {
    if (!textContent || !textName) return
    setSpecs(prev => [...prev, { id: uid(), type: 'text', name: textName, content: textContent, status: 'pending' }])
    setTextName(''); setTextContent('')
  }

  function addRepo() {
    if (!repoUrl || !repoToken) return
    setRepos(prev => [...prev, { id: uid(), platform: repoPlatform, repoUrl, branch: repoBranch, token: repoToken, status: 'pending' }])
    setRepoUrl(''); setRepoToken(''); setRepoBranch('main')
  }

  function addCred() {
    if (!credName || !credValue) return
    setCreds(prev => [...prev, { id: uid(), name: credName, type: credType, value: credValue }])
    setCredName(''); setCredValue('')
  }

  function addEnv() {
    if (!envName || !envBaseUrl) return
    setEnvs(prev => [...prev, { id: uid(), name: envName, baseUrl: envBaseUrl }])
    setEnvName(''); setEnvBaseUrl('')
  }

  function removeItem<T extends { id: string }>(list: T[], setList: (l: T[]) => void, id: string) {
    setList(list.filter(i => i.id !== id))
  }

  async function launch() {
    if (launching) return // prevent double-click
    setLaunching(true)
    try {
      // 1. Create project
      const project = await request<{ id: string }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: projectName, description: projectDesc || undefined }),
      })
      const projectId = project.id

      // 2. Upload specs
      const token = await getToken()
      for (const spec of specs) {
        if (spec.type === 'file' && spec.file) {
          const form = new FormData()
          form.append('file', spec.file)
          await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/projects/${projectId}/documents`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
          })
        } else if (spec.type === 'url' && spec.url) {
          await request(`/projects/${projectId}/documents/import-url`, {
            method: 'POST', body: JSON.stringify({ url: spec.url, type: spec.urlType ?? 'auto' }),
          })
        } else if (spec.type === 'text' && spec.content) {
          await request(`/projects/${projectId}/documents/import-text`, {
            method: 'POST', body: JSON.stringify({ content: spec.content, name: spec.name }),
          })
        }
      }

      // 3. Connect repos
      for (const repo of repos) {
        await request(`/projects/${projectId}/repositories`, {
          method: 'POST',
          body: JSON.stringify({ platform: repo.platform, repoUrl: repo.repoUrl, branch: repo.branch, accessToken: repo.token }),
        })
      }

      // 4. Add environments
      for (const env of envs) {
        await request(`/projects/${projectId}/environments`, {
          method: 'POST', body: JSON.stringify({ name: env.name, baseUrl: env.baseUrl }),
        })
      }

      // 5. Add credentials
      for (const cred of creds) {
        await request(`/projects/${projectId}/credentials`, {
          method: 'POST', body: JSON.stringify({ name: cred.name, type: cred.type, value: cred.value }),
        })
      }

      // Navigate to project
      router.push(`/projects/${projectId}`)
    } catch (err) {
      console.error('Launch failed:', err)
      setLaunching(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground">Set Up Your Project</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure everything Speclyn needs to test your API</p>
      </div>

      {/* Step indicators */}
      <div className="mb-8 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <button
              onClick={() => s.num <= step ? setStep(s.num as Step) : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all w-full ${
                s.num === step ? 'bg-indigo-600 text-white' :
                s.num < step ? 'bg-indigo-50 text-indigo-600 cursor-pointer' :
                'bg-muted text-muted-foreground'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                s.num < step ? 'bg-indigo-600 text-white' :
                s.num === step ? 'bg-white/20 text-white' :
                'bg-muted text-muted-foreground'
              }`}>
                {s.num < step ? '✓' : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-2 bg-muted shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-border bg-white p-6">
        {/* Step 1: Project Info */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Project Information</h2>
            <input
              value={projectName} onChange={e => setProjectName(e.target.value)}
              placeholder="Project name"
              className="w-full rounded-lg border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
            />
            <textarea
              value={projectDesc} onChange={e => setProjectDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="w-full rounded-lg border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none resize-none"
            />
          </div>
        )}

        {/* Step 2: Spec Documents */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Spec Documents</h2>
            <p className="text-xs text-muted-foreground">Upload files, paste URLs, or enter text. Add as many as you need.</p>

            {/* Added items */}
            {specs.length > 0 && (
              <div className="divide-y divide-border rounded-xl border border-border">
                {specs.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      s.type === 'file' ? 'bg-blue-50 text-blue-600' :
                      s.type === 'url' ? 'bg-green-50 text-green-600' :
                      'bg-amber-50 text-amber-600'
                    }`}>{s.type}</span>
                    <p className="flex-1 truncate text-xs text-foreground">{s.name}</p>
                    <button onClick={() => removeItem(specs, setSpecs, s.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add file */}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.json,.yaml,.yml,.txt,.md" className="hidden" onChange={e => addFiles(e.target.files)} />
              <button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
                + Upload Files
              </button>
            </div>

            {/* Add URL */}
            <div className="flex gap-2">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://petstore.swagger.io/v2/swagger.json"
                className="flex-1 rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
              <select value={urlType} onChange={e => setUrlType(e.target.value as typeof urlType)}
                className="rounded-lg border border-border px-2 py-2 text-xs text-foreground focus:border-indigo-400 focus:outline-none">
                <option value="auto">Auto</option>
                <option value="swagger">Swagger</option>
                <option value="postman">Postman</option>
              </select>
              <button onClick={addUrl} disabled={!urlInput} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                Add URL
              </button>
            </div>

            {/* Add text */}
            <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
              <input value={textName} onChange={e => setTextName(e.target.value)} placeholder="Document name"
                className="w-full rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
              <textarea value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Paste spec text, requirements, or API documentation..."
                rows={4} className="w-full rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none resize-y" />
              <button onClick={addText} disabled={!textContent || !textName} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                Add Text
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Repositories */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Connect Repositories</h2>
            <p className="text-xs text-muted-foreground">Link your code repos so Speclyn can discover API endpoints automatically. Optional — skip if you uploaded specs.</p>

            {repos.length > 0 && (
              <div className="divide-y divide-border rounded-xl border border-border">
                {repos.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      r.platform === 'github' ? 'bg-zinc-900 text-white' :
                      r.platform === 'bitbucket' ? 'bg-blue-600 text-white' :
                      'bg-orange-500 text-white'
                    }`}>{r.platform}</span>
                    <p className="flex-1 truncate text-xs text-foreground">{r.repoUrl} ({r.branch})</p>
                    <button onClick={() => removeItem(repos, setRepos, r.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* Info box about OAuth */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <p className="text-xs text-indigo-700">
                <span className="font-medium">Tip:</span> You can connect repos via <strong>GitHub / Bitbucket OAuth</strong> from the <strong>Repositories</strong> page after the project is created. Use the manual option below if you want to add a repo now.
              </p>
            </div>

            {/* Manual token connection */}
            <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={repoPlatform} onChange={e => setRepoPlatform(e.target.value as typeof repoPlatform)}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-foreground focus:border-indigo-400 focus:outline-none">
                    <option value="github">GitHub</option>
                    <option value="bitbucket">Bitbucket</option>
                    <option value="gitlab">GitLab</option>
                  </select>
                  <input value={repoBranch} onChange={e => setRepoBranch(e.target.value)} placeholder="Branch (main)"
                    className="rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                </div>
                <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                  placeholder={
                    repoPlatform === 'bitbucket' ? 'https://bitbucket.org/workspace/repo.git' :
                    repoPlatform === 'gitlab' ? 'https://gitlab.com/owner/repo.git' :
                    'https://github.com/owner/repo.git'
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                <input value={repoToken} onChange={e => setRepoToken(e.target.value)} type="password"
                  placeholder={
                    repoPlatform === 'bitbucket' ? 'Bitbucket App Password' :
                    repoPlatform === 'gitlab' ? 'GitLab Personal Access Token' :
                    'GitHub Personal Access Token'
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                <button onClick={addRepo} disabled={!repoUrl || !repoToken} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                  + Add Repository
                </button>
              </div>
          </div>
        )}

        {/* Step 4: Credentials & Environments */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Environments</h2>
              <p className="text-xs text-muted-foreground">Add the base URLs of your API environments.</p>
              {envs.length > 0 && (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {envs.map(e => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <p className="text-xs font-medium text-foreground">{e.name}</p>
                      <p className="flex-1 truncate text-xs font-mono text-muted-foreground">{e.baseUrl}</p>
                      <button onClick={() => removeItem(envs, setEnvs, e.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={envName} onChange={e => setEnvName(e.target.value)} placeholder="e.g. Staging"
                  className="w-32 rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                <input value={envBaseUrl} onChange={e => setEnvBaseUrl(e.target.value)} placeholder="https://staging-api.example.com" type="url"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                <button onClick={addEnv} disabled={!envName || !envBaseUrl} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                  Add
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Credentials</h2>
              <p className="text-xs text-muted-foreground">API keys, tokens, and auth credentials for your endpoints. All values are AES-256 encrypted at rest — never stored in plaintext.</p>
              {creds.length > 0 && (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {creds.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.type === 'bearer' ? 'bg-purple-50 text-purple-600' :
                        c.type === 'api_key' ? 'bg-blue-50 text-blue-600' :
                        c.type === 'basic_auth' ? 'bg-amber-50 text-amber-600' :
                        c.type === 'oauth2' ? 'bg-green-50 text-green-600' :
                        'bg-muted text-muted-foreground'
                      }`}>{c.type.replace('_', ' ')}</span>
                      <p className="flex-1 text-xs text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{'•'.repeat(8)}{c.value.slice(-4)}</p>
                      <button onClick={() => removeItem(creds, setCreds, c.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={credName} onChange={e => setCredName(e.target.value)} placeholder="Credential name (e.g. Staging Auth Token)"
                    className="rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                  <select value={credType} onChange={e => setCredType(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-foreground focus:border-indigo-400 focus:outline-none">
                    <option value="bearer">Bearer Token (JWT, access token)</option>
                    <option value="api_key">API Key (x-api-key header)</option>
                    <option value="basic_auth">Basic Auth (username:password)</option>
                    <option value="oauth2">OAuth 2.0 Client Credentials</option>
                    <option value="custom_header">Custom Header</option>
                  </select>
                </div>
                <input value={credValue} onChange={e => setCredValue(e.target.value)} type="password"
                  placeholder={
                    credType === 'bearer' ? 'eyJhbGciOiJIUzI1NiIs...' :
                    credType === 'api_key' ? 'sk-live-abc123...' :
                    credType === 'basic_auth' ? 'username:password' :
                    credType === 'oauth2' ? 'client_id:client_secret' :
                    'Header-Name: value'
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    {credType === 'bearer' ? 'Sent as Authorization: Bearer <token>' :
                     credType === 'api_key' ? 'Sent as x-api-key header' :
                     credType === 'basic_auth' ? 'Sent as Authorization: Basic <base64>' :
                     credType === 'oauth2' ? 'Used to request access token from token endpoint' :
                     'Sent as custom request header'}
                  </p>
                  <button onClick={addCred} disabled={!credName || !credValue} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                    + Add Credential
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review & Launch */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Review & Launch</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Project</p>
                <p className="text-sm font-semibold text-foreground">{projectName || 'Untitled'}</p>
                {projectDesc && <p className="mt-1 text-xs text-muted-foreground">{projectDesc}</p>}
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Inputs</p>
                <p className="text-sm text-foreground">{specs.length} spec document{specs.length !== 1 ? 's' : ''}</p>
                <p className="text-sm text-foreground">{repos.length} repositor{repos.length !== 1 ? 'ies' : 'y'}</p>
                <p className="text-sm text-foreground">{envs.length} environment{envs.length !== 1 ? 's' : ''}</p>
                <p className="text-sm text-foreground">{creds.length} credential{creds.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <p className="text-xs text-indigo-700">
                Clicking "Launch" will create your project and start all AI pipelines:
                document parsing, requirement extraction, repo analysis, and endpoint discovery.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => step > 1 ? setStep((step - 1) as Step) : router.push('/projects')}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        {step < 5 ? (
          <button
            onClick={() => setStep((step + 1) as Step)}
            disabled={step === 1 && !projectName}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={() => void launch()}
            disabled={launching || !projectName}
            className="rounded-lg bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {launching ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
                  <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Launching...
              </span>
            ) : 'Launch Project'}
          </button>
        )}
      </div>
    </div>
  )
}
