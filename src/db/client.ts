// The database: Cloudflare D1, which is SQLite. Opening it is free, so every
// caller asks for a handle when it needs one. The schema is applied by
// `wrangler d1 migrations apply`, not from here.
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function getDb() {
  return drizzle(env.DB, { schema })
}

export { schema }
