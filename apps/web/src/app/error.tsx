'use client'

import { useEffect } from 'react'
import { ErrorCard } from '@/components/shared/error-card'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ErrorCard
        title="Something went wrong"
        message={error.message}
        onRetry={reset}
      />
    </div>
  )
}
