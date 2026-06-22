// https://nuxt.com/docs/api/configuration/nuxt-config
//
// n-moves is a pure client-side SPA: the Stockfish engine, the board, and all
// run state live in the browser. There is no backend. Because v0 uses the
// single-thread Stockfish build, no cross-origin isolation (COOP/COEP) is
// needed, so no special headers here.
export default defineNuxtConfig({
  // Client-only SPA — no server-side rendering.
  ssr: false,

  compatibilityDate: '2026-06-22',

  devtools: { enabled: true },

  // Deploy target. There's no server logic (ssr:false), so at deploy time
  // (Task 8) we may switch to 'vercel-static' / `nuxt generate` for a purely
  // static deploy; 'vercel' is fine and serves the SPA fallback meanwhile.
  nitro: {
    preset: 'vercel',
  },
})
