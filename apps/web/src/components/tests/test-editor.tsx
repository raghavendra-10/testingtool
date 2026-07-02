'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.default), { ssr: false })

interface GeneratedTest {
  id: string
  name: string
  testType: string
  status: string
  codeSnapshot: string | null
  qualityScore: number | null
  qualityNotes: string | null
  isEdited: boolean
  compileError: string | null
  endpointId: string | null
}

interface TestListItem {
  id: string
  name: string
  testType: string
  status: string
  qualityScore: number | null
  isEdited: boolean
  compileError: string | null
}

const QUALITY_STARS = ['', '1', '2', '3', '4', '5']
const QUALITY_COLOR: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-amber-500',
  4: 'text-green-500',
  5: 'text-emerald-600',
}

export function TestEditor({ projectId }: { projectId: string }) {
  const { request } = useApiClient()
  const queryClient = useQueryClient()
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [editedCode, setEditedCode] = useState<string | null>(null)
  const [showQualityNotes, setShowQualityNotes] = useState(false)

  const { data: tests, isLoading } = useQuery<TestListItem[]>({
    queryKey: ['tests', projectId],
    queryFn: () => request<TestListItem[]>(`/projects/${projectId}/tests`),
  })

  const { data: selectedTest } = useQuery<GeneratedTest>({
    queryKey: ['test', projectId, selectedTestId],
    queryFn: () => request<GeneratedTest>(`/projects/${projectId}/tests/${selectedTestId}`),
    enabled: !!selectedTestId,
  })

  const saveTest = useMutation({
    mutationFn: (code: string) => request(`/projects/${projectId}/tests/${selectedTestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ codeSnapshot: code }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tests', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['test', projectId, selectedTestId] })
      setEditedCode(null)
    },
  })

  const handleCodeChange = useCallback((value: string | undefined) => {
    if (value !== undefined) setEditedCode(value)
  }, [])

  const currentCode = editedCode ?? selectedTest?.codeSnapshot ?? ''
  const hasChanges = editedCode !== null && editedCode !== selectedTest?.codeSnapshot

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  )

  if (!tests || tests.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="mb-3 text-slate-300" width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M8 4h10l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 18l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <p className="text-sm text-slate-500">No tests generated yet.</p>
      <p className="mt-1 text-xs text-slate-400">Run tests from the Execute tab first.</p>
    </div>
  )

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
      {/* Test list sidebar */}
      <div className="w-72 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <div className="sticky top-0 border-b border-slate-100 bg-white px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Tests ({tests.length})
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {tests.map((test) => (
            <button
              key={test.id}
              onClick={() => { setSelectedTestId(test.id); setEditedCode(null); setShowQualityNotes(false) }}
              className={`w-full px-3 py-2.5 text-left transition-colors ${
                selectedTestId === test.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700">{test.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`text-xs ${test.status === 'active' ? 'text-green-500' : 'text-slate-400'}`}>
                      {test.status}
                    </span>
                    {test.isEdited && (
                      <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">edited</span>
                    )}
                    {test.qualityScore != null && (
                      <span className={`text-xs ${QUALITY_COLOR[test.qualityScore] ?? 'text-slate-400'}`}>
                        {'★'.repeat(test.qualityScore)}{'☆'.repeat(5 - test.qualityScore)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
        {selectedTest ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-700 truncate max-w-md">{selectedTest.name}</p>
                {selectedTest.isEdited && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">manually edited</span>
                )}
                {selectedTest.qualityScore != null && (
                  <button
                    onClick={() => setShowQualityNotes(!showQualityNotes)}
                    className={`text-xs ${QUALITY_COLOR[selectedTest.qualityScore] ?? 'text-slate-400'} hover:underline`}
                  >
                    {'★'.repeat(selectedTest.qualityScore)}{'☆'.repeat(5 - selectedTest.qualityScore)} quality
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <span className="text-xs text-amber-500">unsaved changes</span>
                )}
                <button
                  onClick={() => saveTest.mutate(currentCode)}
                  disabled={!hasChanges || saveTest.isPending}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {saveTest.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Quality notes panel */}
            {showQualityNotes && selectedTest.qualityNotes && (
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 max-h-32 overflow-y-auto">
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">{selectedTest.qualityNotes}</pre>
              </div>
            )}

            {/* Compile error */}
            {selectedTest.compileError && (
              <div className="border-b border-red-100 bg-red-50 px-4 py-2">
                <p className="text-xs text-red-600">{selectedTest.compileError}</p>
              </div>
            )}

            {/* Monaco editor */}
            <div className="flex-1">
              <MonacoEditor
                language="typescript"
                theme="vs-light"
                value={currentCode}
                onChange={handleCodeChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  tabSize: 2,
                  automaticLayout: true,
                  readOnly: false,
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
            Select a test from the list to view and edit its code
          </div>
        )}
      </div>
    </div>
  )
}
