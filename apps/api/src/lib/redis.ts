import { Redis } from 'ioredis'

function getRedisUrl(): string {
  const url = process.env['REDIS_URL']
  if (!url) throw new Error('REDIS_URL environment variable is not set')
  return url
}

export function createRedisClient(): Redis {
  return new Redis(getRedisUrl())
}
