import { evalToWinProb, type EvalScore } from '~/lib/winprob'

// The drift-budget run state machine, kept pure. Given the win% lost on each
// player move it tracks cumulative drift and decides when a run ends. No Vue, no
// chess.js, no engine here — useScoring.ts (Task #4, next) wraps this with
// reactivity and the live board; this file is just arithmetic and branch logic
// so vitest can pin every end-condition exactly.
//
// Loss is measured in win% space and never negative: you cannot out-play the
// engine's best move, so a numerically-negative gap is clamped to 0 — no refunds
// against the oracle.

/**
 * Win% lost by playing `played` instead of the engine's best `best`. Both are
 * side-to-move relative for the SAME player at the same pre-move position, so
 * they subtract directly with no sign flip (the bug magnet from lib/uci.ts).
 * Always ≥ 0.
 */
export function moveLoss(best: EvalScore, played: EvalScore): number {
  return Math.max(0, evalToWinProb(best) - evalToWinProb(played))
}

/** How a run ended; 'active' = still going. */
export type RunStatus = 'active' | 'budget' | 'blunder' | 'max-n' | 'terminal'

export interface RunConfig {
  /** Cumulative win%-pts of drift the run can absorb before it ends. */
  budget: number
  /** A single move losing ≥ this many win%-pts ends the run (one blunder out). */
  blunderCap: number
  /** Plies survived to bank the run as a success. */
  maxN: number
}

// Runtime seed only: every field is overwritten per-run from the user's settings and
// the ladder (maxN = the level, budget = round(drift-per-move × the level)), so these
// just seed the reactive config before the first run. Values mirror the level-1 start:
// one strong move, ~1.5 win%-pts of slack (rounded to 2).
export const DEFAULT_RUN_CONFIG: RunConfig = {
  budget: 2,
  blunderCap: 8,
  maxN: 1,
}

export interface RunState {
  /** Plies the player has survived (scored moves). This is `n` in the trainer. */
  n: number
  /** Cumulative win% lost vs best across the run. */
  drift: number
  status: RunStatus
}

export function initRun(): RunState {
  return { n: 0, drift: 0, status: 'active' }
}

/** True once the run has ended for any reason. */
export function isRunOver(state: RunState): boolean {
  return state.status !== 'active'
}

/**
 * Fold one scored player move into the run: bump `n`, add the (clamped) loss to
 * drift, then resolve the end condition. Precedence: a blunder on THIS move >
 * the cumulative budget blown > max-n reached. max-n only banks a clean
 * survival — blundering on the Nth move ends as 'blunder', not success. A no-op
 * once the run has already ended (returns the same state).
 */
export function applyMove(
  state: RunState,
  loss: number,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): RunState {
  if (state.status !== 'active') return state
  const lost = Math.max(0, loss)
  const n = state.n + 1
  const drift = state.drift + lost
  let status: RunStatus = 'active'
  if (lost >= cfg.blunderCap) status = 'blunder'
  else if (drift >= cfg.budget) status = 'budget'
  else if (n >= cfg.maxN) status = 'max-n'
  return { n, drift, status }
}

/**
 * The board reached a terminal position (checkmate/stalemate/draw), from either
 * the player's move or the opponent's reply. Ends an active run as 'terminal'
 * with `n`/`drift` untouched; leaves an already-ended run alone.
 */
export function applyTerminal(state: RunState): RunState {
  if (state.status !== 'active') return state
  return { ...state, status: 'terminal' }
}
