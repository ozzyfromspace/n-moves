import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// v0 tests are pure-logic only (lib/* math): plain Node env, no Nuxt runtime and
// no DOM. The `~`/`@` aliases mirror Nuxt's srcDir so test imports read exactly
// like app imports. Reactive composables (useScoring) get covered through the
// live harness; only the pure helpers run here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
})
