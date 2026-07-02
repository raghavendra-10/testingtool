'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { LoadingButton } from './loading-button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel?: string
  variant?: 'destructive' | 'default'
  requireNameMatch?: string
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  requireNameMatch,
  loading,
}: ConfirmDialogProps) {
  const [nameInput, setNameInput] = useState('')
  const isDisabled = requireNameMatch ? nameInput !== requireNameMatch : false

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          {variant === 'destructive' && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>

            {requireNameMatch && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  Type <span className="font-mono font-medium text-foreground">{requireNameMatch}</span> to confirm:
                </p>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={requireNameMatch}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <LoadingButton variant="outline" size="sm" onClick={onClose}>
            Cancel
          </LoadingButton>
          <LoadingButton
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            size="sm"
            loading={loading ?? false}
            disabled={isDisabled}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
