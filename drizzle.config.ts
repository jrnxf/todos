import { defineConfig } from 'drizzle-kit'

// Used only by `bun run db:generate`, which writes the SQL files under
// drizzle/. Wrangler applies them (`bun run db:migrate:local` and `:remote`).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
