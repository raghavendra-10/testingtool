'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'The requested resource was not found.',
  UNAUTHORIZED: 'You need to sign in to access this.',
  FORBIDDEN: 'You do not have permission to access this.',
  VALIDATION_ERROR: 'The request data was invalid.',
  INTERNAL_ERROR: 'Something went wrong on our end.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
}

interface ErrorCardProps {
  title?: string
  message?: string
  errorCode?: string
  onRetry?: () => void
  compact?: boolean
  className?: string
}

export function ErrorCard({ title, message, errorCode, onRetry, compact, className }: ErrorCardProps) {
  const displayMessage = message ?? (errorCode ? ERROR_MESSAGES[errorCode] : undefined) ?? 'An unexpected error occurred.'

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2', className)}>
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="flex-1 text-xs text-destructive">{displayMessage}</p>
        {onRetry && (
          <button onClick={onRetry} className="shrink-0 text-xs font-medium text-destructive hover:underline">
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center', className)}>
      <AlertCircle className="mb-3 h-8 w-8 text-destructive/70" />
      <h3 className="text-sm font-medium text-foreground">{title ?? 'Something went wrong'}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{displayMessage}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Try again
        </button>
      )}
    </div>
  )
}
