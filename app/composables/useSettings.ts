import {
  SETTINGS_DEFAULTS,
  parseSettings,
  serializeSettings,
  type Settings,
} from '~/lib/settings'

// One reactive Settings object for the whole app: the trainer snapshots it at each
// run start, the sidebar panel mutates it live, and every change persists to
// localStorage. It's a module-level singleton on purpose — ssr:false means this
// only ever runs client-side, so there's no cross-request state leakage, and a
// singleton spares us prop-drilling settings through the component tree. All the
// clamping/parsing is pure in lib/settings (vitest-covered); here we just add
// reactivity, the initial load, and the persistence watcher.

const STORAGE_KEY = 'n-moves:settings'

const settings = reactive<Settings>({ ...SETTINGS_DEFAULTS })

// The persistence watcher must outlive whichever component happens to mount first,
// so it lives in a detached effect scope rather than that component's scope.
const scope = effectScope(true)
let started = false

function start(): void {
  if (started) return
  started = true

  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(settings, parseSettings(raw))
  }

  scope.run(() => {
    watch(
      settings,
      () => {
        if (typeof localStorage === 'undefined') return
        try {
          localStorage.setItem(STORAGE_KEY, serializeSettings(settings))
        } catch {
          // Storage disabled or full — settings just won't survive a reload.
        }
      },
      { deep: true },
    )
  })
}

export function useSettings() {
  start()

  /** Restore every knob to its shipped default (the persist watcher saves it). */
  function reset(): void {
    Object.assign(settings, SETTINGS_DEFAULTS)
  }

  return { settings, reset }
}
