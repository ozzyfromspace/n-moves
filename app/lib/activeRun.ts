import type { EvalScore } from '~/lib/winprob'
import type { PositionRecord } from '~/lib/positions'
import type { RunConfig, RunState } from '~/lib/scoring'

// The serialisable snapshot of a run in progress (or just-ended), persisted to
// IndexedDB so a refresh resumes exactly where you left off — same position, moves,
// drift, n, level — instead of dealing a new start. useActiveRun owns the I/O; this
// file is the stored shape + a defensive validator, kept pure so vitest covers the
// round-trip and the reject-stale-schema path without a DB.
//
// `moves` is the single backbone: it both rebuilds the board on resume (replay each
// ply) and feeds the scrubber's timeline. Everything else is the run's bookkeeping,
// snapshotted at run start and after every completed ply so the saved state is always
// a clean "player to move" (even ply count) or a finished run.

/** Bump whenever the shape below changes — an older snapshot is then ignored, not misread. */
export const ACTIVE_RUN_VERSION = 1

export interface ActiveRun {
  /** Schema guard; must equal ACTIVE_RUN_VERSION to be restored. */
  version: number
  /** The start this run was dealt — its FEN is replayed from, and "Restart" reuses it. */
  position: PositionRecord
  /** The side the human plays (the side to move at the start). */
  humanColor: 'white' | 'black'
  /** Every ply so far (human + engine, interleaved), long-algebraic UCI, in order. */
  moves: string[]
  /** The drift-budget run state: plies survived, cumulative drift, status. */
  run: RunState
  /** Player-perspective win% at each ply faced — the RunSummary sparkline series. */
  winHistory: number[]
  /** Win%-pts a run-ending blunder cost, when the ending was one bad move (else null). */
  fatalLoss: number | null
  /** The survive-target (ladder level) this run was played at — fixed for the run. */
  playedTarget: number
  /** The run's fixed search work, snapshotted (settings can change between runs). */
  nodes: number
  /** The run's end thresholds, snapshotted (budget / blunder cap / max-n). */
  config: RunConfig
  /** The live eval at the current position, so the win% bar is right on resume. */
  currentEval: EvalScore | null
  /** Whether the run is mid-play ('player') or finished ('over'). */
  phase: 'player' | 'over'
  /** A run-ending error message, if any (only set on a finished run). */
  runError: string | null
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string')

/**
 * Validate a value deserialised from storage. Rejects anything whose version
 * doesn't match or whose core fields are the wrong shape, so a partial write or a
 * schema change can never feed a malformed run into the trainer — the caller then
 * just deals a fresh position.
 */
export function isValidActiveRun(v: unknown): v is ActiveRun {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (r.version !== ACTIVE_RUN_VERSION) return false
  if (typeof r.position !== 'object' || r.position === null) return false
  if (typeof (r.position as PositionRecord).fen !== 'string') return false
  if (r.humanColor !== 'white' && r.humanColor !== 'black') return false
  if (!isStringArray(r.moves)) return false
  if (typeof r.run !== 'object' || r.run === null) return false
  const run = r.run as Record<string, unknown>
  if (typeof run.n !== 'number' || typeof run.drift !== 'number' || typeof run.status !== 'string') {
    return false
  }
  if (!Array.isArray(r.winHistory)) return false
  if (typeof r.config !== 'object' || r.config === null) return false
  if (r.phase !== 'player' && r.phase !== 'over') return false
  return true
}
