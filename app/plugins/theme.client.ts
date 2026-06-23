// Set the resolved theme on <html data-theme> as early as possible on the client,
// before the app renders, so there's no light/dark flash. The reactive state +
// persistence live in composables/useTheme.ts.
export default defineNuxtPlugin(() => {
  try {
    const pref = localStorage.getItem('n-moves:theme') || 'system'
    const dark =
      pref === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : pref === 'dark'
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  } catch {
    // no storage / no matchMedia — fall back to the dark default in :root.
  }
})
