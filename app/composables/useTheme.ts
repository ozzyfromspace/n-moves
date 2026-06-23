// Light / dark / system theme preference, persisted to localStorage and applied to
// <html data-theme>. A module singleton (ssr:false ⇒ client-only). The no-flash
// initial value is set by a client plugin (plugins/theme.client.ts); this composable
// keeps the choice reactive, persists it, and follows the OS while in 'system'.

export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'n-moves:theme'
const pref = ref<ThemePref>('system')
let started = false

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve a preference to a concrete theme and write it to <html data-theme>. */
function apply(p: ThemePref): void {
  if (typeof document === 'undefined') return
  const resolved = p === 'system' ? (systemDark() ? 'dark' : 'light') : p
  document.documentElement.setAttribute('data-theme', resolved)
}

function start(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') pref.value = saved
  apply(pref.value)
  // Track the OS scheme so 'system' flips live when the user changes it.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (pref.value === 'system') apply('system')
  })
}

export function useTheme() {
  start()

  function set(p: ThemePref): void {
    pref.value = p
    apply(p)
    try {
      localStorage.setItem(STORAGE_KEY, p)
    } catch {
      // storage off — the choice just won't survive a reload.
    }
  }

  return { pref: readonly(pref), set }
}
