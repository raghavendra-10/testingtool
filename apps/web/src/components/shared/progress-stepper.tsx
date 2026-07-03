'use client'

import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StepConfig {
  id: string
  label: string
}

interface ProgressStepperProps {
  steps: StepConfig[]
  currentStep: string | null
  completedSteps: string[]
  progress?: { current: number; total: number; detail?: string }
  className?: string
}

export function ProgressStepper({ steps, currentStep, completedSteps, progress, className }: ProgressStepperProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Steps */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isCompleted = completedSteps.includes(step.id)
          const isCurrent = step.id === currentStep
          const isPending = !isCompleted && !isCurrent

          return (
            <div key={step.id} className="flex flex-1 items-center">
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all w-full',
                isCompleted ? 'bg-emerald-50 text-emerald-600' :
                isCurrent ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground',
              )}>
                <span className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  isCompleted ? 'bg-emerald-600 text-white' :
                  isCurrent ? 'bg-white/20 text-white' :
                  'bg-muted text-muted-foreground',
                )}>
                  {isCompleted ? <Check className="h-3 w-3" /> :
                   isCurrent ? <Loader2 className="h-3 w-3 animate-spin" /> :
                   i + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {i < steps.length - 1 && <div className="h-px w-2 bg-border shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* Determinate progress bar */}
      {progress && progress.total > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
            </p>
            {progress.detail && (
              <p className="max-w-xs truncate text-xs font-mono text-muted-foreground">
                {progress.detail}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
