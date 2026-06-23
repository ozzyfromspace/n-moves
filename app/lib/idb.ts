import { openDB, type IDBPDatabase } from 'idb'

// The one place the app opens its IndexedDB. Both useHistory (finished runs) and
// useActiveRun (the resume-in-progress snapshot) share THIS single connection — a
// module-level singleton — so the version-2 upgrade runs exactly once and the two
// stores can't race each other into conflicting opens. Safe as a singleton under
// ssr:false (client-only, no cross-request leakage); returns undefined when
// IndexedDB is missing (private-mode Safari, etc.) so callers degrade quietly.
//
// v1 created `runs`. v2 adds `active` (a single-record store for the live run). The
// upgrade is written additively — it creates only the stores that don't yet exist —
// so a v1 user keeps their run history when the DB migrates under them.

export const DB_NAME = 'n-moves'
export const DB_VERSION = 2
/** Finished runs (autoIncrement id), read by the history sidebar. */
export const RUNS_STORE = 'runs'
/** The single in-progress run snapshot, keyed by ACTIVE_KEY. */
export const ACTIVE_STORE = 'active'
/** The fixed out-of-line key the lone active-run record lives at. */
export const ACTIVE_KEY = 'current'

let dbp: Promise<IDBPDatabase> | undefined

/** Open (once) the shared DB; undefined when IndexedDB isn't available at all. */
export function getDB(): Promise<IDBPDatabase> | undefined {
  if (typeof indexedDB === 'undefined') return undefined
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Additive + idempotent: create only what's absent, so v1→v2 keeps `runs`.
        if (!db.objectStoreNames.contains(RUNS_STORE)) {
          const store = db.createObjectStore(RUNS_STORE, { keyPath: 'id', autoIncrement: true })
          store.createIndex('by-at', 'at') // recent-first ordering
          store.createIndex('by-n', 'n')
        }
        if (!db.objectStoreNames.contains(ACTIVE_STORE)) {
          db.createObjectStore(ACTIVE_STORE) // out-of-line key (ACTIVE_KEY)
        }
      },
    })
  }
  return dbp
}
