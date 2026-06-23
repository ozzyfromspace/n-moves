// The persisted run record and the pure helpers around it. useHistory.ts owns the
// IndexedDB I/O (idb) and the reactive view; this file is just the stored shape,
// compact status labels for the history list, and the best-n reducer — kept pure
// so vitest covers them without a DB or Vue.

import type { RunStatus } from '~/lib/scoring'

/** One completed run, as stored in IndexedDB. `id` is assigned by the autoIncrement store. */
export interface RunRecord {
  id?: number
  /** Epoch ms when the run ended. */
  at: number
  /** Plies survived. */
  n: number
  /** Cumulative win% lost vs best across the run. */
  drift: number
  /** How the run ended (never 'active' once recorded). */
  status: RunStatus
  /** The start position, so a run can be replayed/inspected later. */
  startFen: string
  // The run's parameters, snapshotted — settings can change between runs.
  nodes: number
  budget: number
  blunderCap: number
  maxN: number
}

/** Terse labels for the history list (the ScorePanel/RunSummary copy is more verbose). */
export const RUN_STATUS_SHORT: Record<RunStatus, string> = {
  active: '…',
  'max-n': 'held',
  blunder: 'blunder',
  budget: 'drift',
  terminal: 'ended',
}

/** Only a held run ('max-n') is a win; everything else ended the run early. */
export function isHeld(status: RunStatus): boolean {
  return status === 'max-n'
}

/** Best n across a set of runs (0 for an empty set). */
export function bestNOf(runs: RunRecord[]): number {
  let best = 0
  for (const r of runs) if (r.n > best) best = r.n
  return best
}
