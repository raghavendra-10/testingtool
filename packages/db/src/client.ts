import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index'

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (_db) return _db

  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is not set')

  const isRds = url.includes('rds.amazonaws.com')

  const pool = new Pool({
    connectionString: url,
    ssl: isRds ? { rejectUnauthorized: false } : undefined,
  })
  _db = drizzle(pool, { schema, logger: process.env['NODE_ENV'] === 'development' })
  return _db
}

export type Db = ReturnType<typeof getDb>
