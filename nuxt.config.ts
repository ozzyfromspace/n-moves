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

  // Global manga/anime theme (tokens + base + reusable classes) and the display/body
  // webfonts (Bebas Neue for headers, Inter for body + tabular stat numbers).
  css: ['~/assets/css/theme.css'],
  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },

  // Deploy target. There's no server logic (ssr:false), so at deploy time
  // (Task 8) we may switch to 'vercel-static' / `nuxt generate` for a purely
  // static deploy; 'vercel' is fine and serves the SPA fallback meanwhile.
  nitro: {
    preset: 'vercel',
  },
})
