// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const API_PREFIX = '/api/v1'

export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${API_PREFIX}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
    throw new Error(body.error?.message ?? body.message ?? `API error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  const envelope = await res.json() as { success: boolean; data?: T }
  return (envelope.data ?? envelope) as T
}
