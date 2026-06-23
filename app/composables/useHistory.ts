import { RUNS_STORE, getDB } from '~/lib/idb'
import { bestNOf, type RunRecord } from '~/lib/history'

// Run history in IndexedDB, exposed as a reactive view the sidebar reads and the
// trainer appends to. Like useSettings this is a module-level singleton — one
// shared best-n / recent-runs view — which is safe under ssr:false (client-only,
// no cross-request leakage). The DB handle itself is opened by lib/idb (shared with
// useActiveRun so the schema upgrade runs once). Every method degrades quietly when
// IndexedDB is missing (private-mode Safari, etc.): the app still runs, it just
// won't remember runs. The pure bits (record shape, best-n) live in lib/history.

const RECENT_LIMIT = 12

const allTimeBestN = ref(0)
const recentRuns = shallowRef<RunRecord[]>([])
const ready = ref(false)
const error = ref<string | null>(null)

let loaded = false

export function useHistory() {
  /** Open the DB and hydrate the reactive best-n + recent list. Idempotent; never throws. */
  async function load(): Promise<void> {
    if (loaded) return
    const p = getDB()
    if (!p) {
      error.value = 'history unavailable (no IndexedDB in this browser)'
      return
    }
    try {
      const conn = await p
      const all = (await conn.getAllFromIndex(RUNS_STORE, 'by-at')) as RunRecord[]
      recentRuns.value = all.slice(-RECENT_LIMIT).reverse() // newest first
      allTimeBestN.value = bestNOf(all)
      loaded = true
      ready.value = true
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  /**
   * Append a finished run. Updates the reactive view *synchronously* (so the
   * run-over screen can already show a fresh best-n / record), then persists in the
   * background. A persist failure is surfaced on `error` but never thrown.
   */
  function record(run: Omit<RunRecord, 'id' | 'at'>): void {
    const full: RunRecord = { ...run, at: Date.now() }
    if (full.n > allTimeBestN.value) allTimeBestN.value = full.n
    recentRuns.value = [full, ...recentRuns.value].slice(0, RECENT_LIMIT)

    const p = getDB()
    if (!p) return
    void p
      .then(conn => conn.add(RUNS_STORE, full))
      .catch(e => {
        error.value = (e as Error).message
      })
  }

  /** Wipe all history (and the reactive view). */
  async function clear(): Promise<void> {
    allTimeBestN.value = 0
    recentRuns.value = []
    const p = getDB()
    if (!p) return
    try {
      const conn = await p
      await conn.clear(RUNS_STORE)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return { allTimeBestN, recentRuns, ready, error, load, record, clear }
}
