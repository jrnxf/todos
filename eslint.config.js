//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.output/',
      '.nitro/',
      'dist/',
      // Design pages for review; gitignored, and not our source.
      '.lavish/',
      // Stock shadcn components, kept close to what the CLI writes so that
      // `shadcn add --diff` stays readable. Lint our code, not theirs.
      'src/components/ui/',
      // Written by `wrangler types`.
      'worker-configuration.d.ts',
    ],
  },
]
