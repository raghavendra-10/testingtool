'use client'

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Upload } from 'lucide-react'

const ACCEPTED = '.pdf,.docx,.json,.yaml,.yml,.txt,.md'
const MAX_MB = 20

type ImportTab = 'file' | 'url' | 'paste'

export function UploadZone({ projectId }: { projectId: string }) {
  const { getToken } = useAuth()
  const { request } = useApiClient()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [activeTab, setActiveTab] = useState<ImportTab>('file')

  // URL import state
  const [importUrl, setImportUrl] = useState('')
  const [importType, setImportType] = useState<'auto' | 'swagger' | 'postman'>('auto')

  // Text paste state
  const [pasteContent, setPasteContent] = useState('')
  const [pasteName, setPasteName] = useState('')

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`File too large. Max size is ${MAX_MB}MB`)
      const token = await getToken()
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/projects/${projectId}/documents`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
      )
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message ?? `Upload failed (${res.status})`) }
      return res.json()
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['documents', projectId] }),
  })

  const urlImport = useMutation({
    mutationFn: () => request(`/projects/${projectId}/documents/import-url`, {
      method: 'POST',
      body: JSON.stringify({ url: importUrl, type: importType }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
      setImportUrl('')
    },
  })

  const textImport = useMutation({
    mutationFn: () => request(`/projects/${projectId}/documents/import-text`, {
      method: 'POST',
      body: JSON.stringify({ content: pasteContent, name: pasteName || 'Pasted spec' }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
      setPasteContent(''); setPasteName('')
    },
  })

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    upload.reset()
    Array.from(files).forEach((f) => upload.mutate(f))
  }

  const tabs: { id: ImportTab; label: string }[] = [
    { id: 'file', label: 'Upload File' },
    { id: 'url', label: 'Import URL' },
    { id: 'paste', label: 'Paste Text' },
  ]

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* File upload */}
      {activeTab === 'file' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => !upload.isPending && inputRef.current?.click()}
          className={`cursor-pointer px-6 py-8 transition-all ${dragOver ? 'bg-indigo-50' : 'hover:bg-muted/50'}`}
        >
          <input ref={inputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          {upload.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Drop your spec here, or <span className="text-indigo-600">browse</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">PDF, DOCX, Markdown, OpenAPI (JSON/YAML), Postman Collection, TXT · Max {MAX_MB}MB</p>
              </div>
            </div>
          )}
          {upload.isError && <p className="mt-2 text-center text-xs text-red-500">{upload.error.message}</p>}
        </div>
      )}

      {/* URL import */}
      {activeTab === 'url' && (
        <div className="p-5 space-y-3">
          <div className="flex gap-3">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://petstore.swagger.io/v2/swagger.json"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none transition-colors"
            />
            <select
              value={importType}
              onChange={(e) => setImportType(e.target.value as typeof importType)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
            >
              <option value="auto">Auto-detect</option>
              <option value="swagger">Swagger/OpenAPI</option>
              <option value="postman">Postman Collection</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Paste a Swagger URL, OpenAPI spec URL, or Postman collection URL</p>
            <button
              onClick={() => urlImport.mutate()}
              disabled={!importUrl || urlImport.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {urlImport.isPending ? 'Importing...' : 'Import'}
            </button>
          </div>
          {urlImport.isError && <p className="text-xs text-red-500">{urlImport.error.message}</p>}
        </div>
      )}

      {/* Text paste */}
      {activeTab === 'paste' && (
        <div className="p-5 space-y-3">
          <input
            type="text"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="Document name (e.g. API Requirements)"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none transition-colors"
          />
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste your requirements, spec text, or API documentation here..."
            rows={8}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none resize-y transition-colors"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{pasteContent.length.toLocaleString()} characters</p>
            <button
              onClick={() => textImport.mutate()}
              disabled={pasteContent.length < 10 || textImport.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {textImport.isPending ? 'Importing...' : 'Import Text'}
            </button>
          </div>
          {textImport.isError && <p className="text-xs text-red-500">{textImport.error.message}</p>}
        </div>
      )}
    </div>
  )
}
