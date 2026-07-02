import type { FastifyInstance } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { createRedisClient } from '../lib/redis.js'
import { verifyStreamToken } from './stream-token.js'

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/projects/:projectId/ws',
    { websocket: true },
    async (connection: SocketStream, req) => {
      const ws = connection.socket
      const { projectId } = req.params as { projectId: string }
      const { token }     = req.query  as { token?: string }

      if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing token' }))
        ws.close(1008, 'Missing token')
        return
      }

      const auth = verifyStreamToken(token)
      if (!auth || auth.projectId !== projectId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }))
        ws.close(1008, 'Unauthorized')
        return
      }

      const subscriber = createRedisClient()
      const channel    = `project:${projectId}:updates`

      subscriber.on('message', (_chan: string, message: string) => {
        if (ws.readyState === ws.OPEN) ws.send(message)
      })

      await subscriber.subscribe(channel)

      const heartbeat = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        } else {
          clearInterval(heartbeat)
        }
      }, 25_000)

      ws.on('close', async () => {
        clearInterval(heartbeat)
        await subscriber.unsubscribe(channel)
        subscriber.disconnect()
      })

      ws.on('error', () => {
        clearInterval(heartbeat)
        void subscriber.unsubscribe(channel).then(() => subscriber.disconnect())
      })
    },
  )
}
