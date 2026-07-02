// Single Redis connection config — import this in every worker and queue file

export function getRedisConnection() {
  const url = process.env['REDIS_URL']
  if (!url) throw new Error('REDIS_URL environment variable is not set')
  return { url }
}

// BullMQ compatible connection object
export const redisConnection = {
  get connection() {
    return getRedisConnection()
  },
}
