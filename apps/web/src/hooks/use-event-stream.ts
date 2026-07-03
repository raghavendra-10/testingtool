'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useApiClient } from './use-api-client'

interface EventStreamOptions {
  projectId: string
  runId: string
  enabled?: boolean
}

interface StreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * Hardened SSE hook with reconnect backoff + jitter, pause on hidden tab,
 * and snapshot refetch on resume. Replaces all ad-hoc SSE wiring.
 */
export function useEventStream({ projectId, runId, enabled = true }: EventStreamOptions) {
  const { request } = useApiClient()
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 10

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const connect = useCallback(async () => {
    if (!enabled || !runId) return

    try {
      const result = await request<{ token: string }>(
        `/projects/${projectId}/runs/${runId}/stream-token`,
        { method: 'POST' },
      )

      esRef.current?.close()
      const es = new EventSource(
        `${API_BASE}/api/v1/projects/${projectId}/runs/${runId}/events?token=${result.token}`,
      )
      esRef.current = es

      es.addEventListener('step', (e: MessageEvent) => {
        const event = JSON.parse(e.data as string) as StreamEvent
        setEvents(prev => [...prev, event])
      })

      es.addEventListener('done', () => {
        setConnected(false)
        es.close()
      })

      es.onopen = () => {
        setConnected(true)
        setError(null)
        retryCountRef.current = 0
      }

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setConnected(false)
          // Reconnect with exponential backoff + jitter
          if (retryCountRef.current < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000)
            const jitter = Math.random() * delay * 0.3
            retryCountRef.current++
            setTimeout(() => void connect(), delay + jitter)
          } else {
            setError('Connection lost. Please refresh.')
          }
        }
      }
    } catch (err) {
      setError('Failed to connect to live stream')
    }
  }, [enabled, runId, projectId, request, API_BASE])

  // Connect on mount/runId change
  useEffect(() => {
    if (enabled && runId) {
      void connect()
    }
    return () => {
      esRef.current?.close()
    }
  }, [enabled, runId, connect])

  // Pause when tab is hidden, reconnect when visible
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && enabled && runId) {
        void connect()
      } else if (document.visibilityState === 'hidden') {
        esRef.current?.close()
        setConnected(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [enabled, runId, connect])

  const reset = useCallback(() => {
    setEvents([])
    setError(null)
    setConnected(false)
    retryCountRef.current = 0
  }, [])

  return { events, connected, error, reset, reconnect: connect }
}
