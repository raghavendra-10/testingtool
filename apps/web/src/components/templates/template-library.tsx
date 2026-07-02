'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'

interface Template {
  id: string
  name: string
  category: string
  description: string | null
  createdAt: string
}

const CATEGORY_COLOR: Record<string, string> = {
  auth: 'bg-purple-50 text-purple-600',
  crud: 'bg-blue-50 text-blue-600',
  payments: 'bg-green-50 text-green-600',
  ecommerce: 'bg-amber-50 text-amber-600',
}

export function TemplateLibrary() {
  const { request } = useApiClient()

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => request<Template[]>('/templates'),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Spec Templates</h1>
        <p className="text-sm text-slate-500">Pre-built requirement sets for common API patterns</p>
      </div>

      {!templates || templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">No templates available.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-5 transition-all hover:shadow-md hover:border-indigo-200">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">{t.name}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLOR[t.category] ?? 'bg-slate-100 text-slate-500'}`}>
                  {t.category}
                </span>
              </div>
              {t.description && <p className="text-xs text-slate-500 line-clamp-2">{t.description}</p>}
              <button className="mt-4 w-full rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors">
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
