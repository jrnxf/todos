// For tests only: the app's database as SQLite in memory, built by running
// the same migrations wrangler applies to D1, behind the same drizzle API.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from '@/db/schema'
import type { SQLInputValue } from 'node:sqlite'
import type { Db } from './sync'

const MIGRATIONS = join(import.meta.dirname, '../../drizzle')

export function testDb(): Db {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue
    const text = readFileSync(join(MIGRATIONS, file), 'utf8')
    for (const statement of text.split('--> statement-breakpoint')) {
      sqlite.exec(statement)
    }
  }
  return drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql)
      const values = params.map((value): SQLInputValue =>
        typeof value === 'boolean' ? Number(value) : value,
      )
      if (method === 'run') {
        statement.run(...values)
        return { rows: [] }
      }
      statement.setReturnArrays(true)
      if (method === 'get')
        return { rows: statement.get(...values) as unknown as Array<unknown> }
      return { rows: statement.all(...values) }
    },
    { schema },
  )
}
