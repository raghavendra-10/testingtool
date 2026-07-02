'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from './use-api-client'

interface DocumentUpdatedMessage {
  type: 'document.updated'
  data: { id: string; status: string; requirementCount?: number }
}
interface RequirementsUpdatedMessage  { type: 'requirements.updated' }
interface EndpointsUpdatedMessage     { type: 'endpoints.updated' }
interface RepositoriesUpdatedMessage  { type: 'repositories.updated' }
interface PingMessage                 { type: 'ping' }

type WsMessage =
  | DocumentUpdatedMessage
  | RequirementsUpdatedMessage
  | EndpointsUpdatedMessage
  | RepositoriesUpdatedMessage
  | PingMessage

const MAX_RETRIES = 8
const BASE_DELAY  = 2000 // ms

export function useProjectSocket(projectId: string) {
  const queryClient        = useQueryClient()
  const { request }        = useApiClient()
  const wsRef              = useRef<WebSocket | null>(null)
  const reconnectTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef       = useRef(false)
  const retryCountRef      = useRef(0)

  useEffect(() => {
    unmountedRef.current  = false
    retryCountRef.current = 0

    async function connect() {
      if (unmountedRef.current) return

      try {
        const { token } = await request<{ token: string }>(
          `/projects/${projectId}/stream-token`,
          { method: 'POST' },
        )

        if (unmountedRef.current) return

        retryCountRef.current = 0 // reset on successful token fetch

        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
        const wsBase  = apiBase.replace(/^http/, 'ws')
        const ws      = new WebSocket(`${wsBase}/api/v1/projects/${projectId}/ws?token=${token}`)
        wsRef.current = ws

        ws.onmessage = (event: MessageEvent) => {
          let msg: WsMessage
          try { msg = JSON.parse(event.data as string) as WsMessage } catch { return }

          if (msg.type === 'document.updated') {
            queryClient.setQueryData<{ id: string; status: string; requirementCount?: number | null }[]>(
              ['documents', projectId],
              (old) => {
                if (!old) return old
                return old.map((doc) =>
                  doc.id === msg.data.id
                    ? { ...doc, status: msg.data.status, ...(msg.data.requirementCount != null ? { requirementCount: msg.data.requirementCount } : {}) }
                    : doc,
                )
              },
            )
          } else if (msg.type === 'requirements.updated') {
            void queryClient.invalidateQueries({ queryKey: ['requirements', projectId] })
          } else if (msg.type === 'endpoints.updated') {
            void queryClient.invalidateQueries({ queryKey: ['endpoints', projectId] })
          } else if (msg.type === 'repositories.updated') {
            void queryClient.invalidateQueries({ queryKey: ['repositories', projectId] })
          }
        }

        ws.onclose = () => {
          if (unmountedRef.current) return
          scheduleReconnect()
        }

        ws.onerror = () => { ws.close() }

      } catch {
        if (!unmountedRef.current) scheduleReconnect()
      }
    }

    function scheduleReconnect() {
      if (unmountedRef.current) return
      if (retryCountRef.current >= MAX_RETRIES) return // give up silently

      const delay = Math.min(BASE_DELAY * 2 ** retryCountRef.current, 60_000)
      retryCountRef.current += 1
      reconnectTimer.current = setTimeout(() => void connect(), delay)
    }

    void connect()

    return () => {
      unmountedRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [projectId, queryClient, request])
}
