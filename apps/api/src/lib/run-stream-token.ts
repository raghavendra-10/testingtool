import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): Buffer {
  const s = process.env['STREAM_TOKEN_SECRET']
  if (!s) throw new Error('STREAM_TOKEN_SECRET is not set')
  return Buffer.from(s, 'utf8')
}

interface RunTokenPayload {
  userId: string
  projectId: string
  runId: string
  expiresAt: number
}

export function signRunStreamToken(payload: RunTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyRunStreamToken(token: string): RunTokenPayload | null {
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null
    const expected = createHmac('sha256', getSecret()).update(data).digest('base64url')
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as RunTokenPayload
    if (payload.expiresAt < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
