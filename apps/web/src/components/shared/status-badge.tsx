'use client'

import { cn } from '@/lib/utils'

type StatusVariant =
  | 'pending' | 'generating' | 'analyzing' | 'running' | 'processing'
  | 'passed' | 'completed' | 'connected' | 'active'
  | 'failed' | 'error' | 'cancelled'
  | 'draft' | 'stale' | 'partial'

const VARIANT_STYLES: Record<string, { bg: string; text: string; dot: string; pulse: boolean }> = {
  pending:    { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground', pulse: false },
  generating: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', pulse: true },
  analyzing:  { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', pulse: true },
  running:    { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', pulse: true },
  processing: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', pulse: true },
  passed:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', pulse: false },
  completed:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', pulse: false },
  connected:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', pulse: false },
  active:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', pulse: false },
  failed:     { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', pulse: false },
  error:      { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', pulse: false },
  cancelled:  { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', pulse: false },
  draft:      { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground', pulse: false },
  stale:      { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', pulse: false },
  partial:    { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', pulse: false },
}

const DEFAULT_STYLE: { bg: string; text: string; dot: string; pulse: boolean } = { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground', pulse: false }

interface StatusBadgeProps {
  status: string
  className?: string
  showDot?: boolean
}

export function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  const style = VARIANT_STYLES[status] ?? DEFAULT_STYLE

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', style.bg, style.text, className)}>
      {showDot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', style.dot, style.pulse && 'animate-pulse')} />
      )}
      {status}
    </span>
  )
}
