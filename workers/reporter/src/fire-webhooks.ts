import { createHmac } from 'crypto'
import { getDb, outboundWebhooks } from '@speclyn/db'
import { and, eq } from 'drizzle-orm'

/**
 * Fire all enabled outbound webhooks for a project that subscribe to the given event.
 * Non-fatal — a delivery failure never affects the run result.
 */
export async function fireOutboundWebhooks(
  projectId: string,
  event: 'run_completed' | 'defect_created' | 'coverage_changed',
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getDb()

  let hooks: Array<{ url: string; secret: string | null; events: string }>
  try {
    hooks = await db
      .select({ url: outboundWebhooks.url, secret: outboundWebhooks.secret, events: outboundWebhooks.events })
      .from(outboundWebhooks)
      .where(and(eq(outboundWebhooks.projectId, projectId), eq(outboundWebhooks.enabled, true)))
  } catch (err) {
    console.warn('[fire-webhooks] Failed to load webhooks:', err)
    return
  }

  const matching = hooks.filter(h => h.events.split(',').map(e => e.trim()).includes(event))
  if (matching.length === 0) return

  const body = JSON.stringify({ event, projectId, timestamp: new Date().toISOString(), data: payload })

  const deliveries = matching.map(async (hook) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Speclyn-Event': event,
      'X-Speclyn-Delivery': crypto.randomUUID(),
    }

    if (hook.secret) {
      headers['X-Speclyn-Signature'] = 'sha256=' + createHmac('sha256', hook.secret).update(body).digest('hex')
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(hook.url, { method: 'POST', headers, body, signal: controller.signal })
      clearTimeout(timeout)
      console.log(`[fire-webhooks] Delivered ${event} to ${hook.url} → ${res.status}`)
    } catch (err) {
      console.warn(`[fire-webhooks] Delivery failed to ${hook.url}:`, String(err).slice(0, 150))
    }
  })

  await Promise.allSettled(deliveries)
}
