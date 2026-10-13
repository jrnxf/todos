// Standalone test config on purpose: vite.config.ts pulls in the devtools /
// nitro / tailwind / TanStack Start plugins, whose watchers keep ~14 file
// handles open after the suite finishes and stall every `vitest run` for the
// 10s close timeout. The tests are plain unit tests over src/lib, src/server
// and the eval's sums in scripts; they need path aliases and nothing else.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
