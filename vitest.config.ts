import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared') } },
  // main-process tests run in Node; renderer tests (test/renderer/*.test.tsx) opt into jsdom with `// @vitest-environment jsdom`
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'] }
})
