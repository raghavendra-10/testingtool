'use client'

import { GitBranch, FileText, BarChart3, Play, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OnboardingStep {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  completed: boolean
  href?: string
}

interface OnboardingChecklistProps {
  projectId: string
  hasRepo: boolean
  hasDocs: boolean
  hasAnalysis: boolean
  hasRun: boolean
  onDismiss?: () => void
}

export function OnboardingChecklist({ projectId, hasRepo, hasDocs, hasAnalysis, hasRun, onDismiss }: OnboardingChecklistProps) {
  const steps: OnboardingStep[] = [
    { id: 'repo', label: 'Connect a repository', description: 'Link GitHub or Bitbucket so Speclyn can discover endpoints', icon: <GitBranch className="h-4 w-4" />, completed: hasRepo, href: `/projects/${projectId}/repositories` },
    { id: 'docs', label: 'Upload spec documents', description: 'Upload SRS, OpenAPI spec, or requirements docs', icon: <FileText className="h-4 w-4" />, completed: hasDocs, href: `/projects/${projectId}` },
    { id: 'analysis', label: 'Run code analysis', description: 'Analyze your codebase for issues and patterns', icon: <BarChart3 className="h-4 w-4" />, completed: hasAnalysis, href: `/projects/${projectId}/analysis` },
    { id: 'run', label: 'Execute tests', description: 'Generate and run API tests against your endpoints', icon: <Play className="h-4 w-4" />, completed: hasRun, href: `/projects/${projectId}/execute` },
  ]

  const completedCount = steps.filter(s => s.completed).length
  const allDone = completedCount === steps.length

  if (allDone) return null

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Get started with Speclyn</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{completedCount} of {steps.length} steps completed</p>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map(step => (
          <a
            key={step.id}
            href={step.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
              step.completed ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-muted/50 text-foreground',
            )}
          >
            <span className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full shrink-0',
              step.completed ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground',
            )}>
              {step.completed ? <Check className="h-3.5 w-3.5" /> : step.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', step.completed && 'line-through opacity-70')}>{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
