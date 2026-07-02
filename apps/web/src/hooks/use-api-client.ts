'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'

export function useApiClient() {
  const { getToken } = useAuth()

  const request = useCallback(
    async <T>(path: string, options: RequestInit = {}): Promise<T> => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return apiFetch<T>(path, token, options)
    },
    [getToken],
  )

  return { request }
}
