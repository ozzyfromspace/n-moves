import { ACTIVE_KEY, ACTIVE_STORE, getDB } from '~/lib/idb'
import { isValidActiveRun, type ActiveRun } from '~/lib/activeRun'

// Persistence for the run in progress: a single IndexedDB record (the `active`
// store) that ChessTrainer writes at every stable point — run start and after each
// completed ply — and reads once on mount to resume exactly where the player left
// off. Every method is best-effort: a write that fails or a browser without
// IndexedDB just means a refresh deals a fresh start, never an error into the loop.
// The snapshot shape and its validator are pure in lib/activeRun (vitest-covered);
// this composable only adds the DB I/O.

export function useActiveRun() {
  /** Persist the current run snapshot, overwriting any prior one. Never throws. */
  async function save(run: ActiveRun): Promise<void> {
    const p = getDB()
    if (!p) return
    try {
      const conn = await p
      await conn.put(ACTIVE_STORE, run, ACTIVE_KEY)
    } catch {
      // Storage full/disabled — the run just won't survive a refresh.
    }
  }

  /** The saved run, or null when there's none / it's unreadable / it's a stale schema. */
  async function loadSaved(): Promise<ActiveRun | null> {
    const p = getDB()
    if (!p) return null
    try {
      const conn = await p
      const raw = await conn.get(ACTIVE_STORE, ACTIVE_KEY)
      return isValidActiveRun(raw) ? raw : null
    } catch {
      return null
    }
  }

  /** Drop the saved run (e.g. on an explicit discard). Never throws. */
  async function clearSaved(): Promise<void> {
    const p = getDB()
    if (!p) return
    try {
      const conn = await p
      await conn.delete(ACTIVE_STORE, ACTIVE_KEY)
    } catch {
      // Nothing to recover from — best-effort.
    }
  }

  return { save, loadSaved, clearSaved }
}
