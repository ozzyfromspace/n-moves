// The level ladder, kept pure. A run is played at the current level = how many of
// your own moves you must survive (within the drift budget) to score a win. Two
// streaks drive the climb, and at most one is ever non-zero (a win clears busts, a
// bust clears wins):
//   • win `winsToAdvance` runs in a row at a level → climb one level.
//   • bust `lossesToDemote` runs in a row at a level → drop one level (never below the
//     start). Failing should be a real setback, not a free retry.
// A natural game end before the target (terminal) is neither — it touches neither
// streak. No Vue here; useLadder.ts adds reactivity + localStorage, vitest pins it.

import type { RunStatus } from '~/lib/scoring'

/** The level every climb starts at, and never drops below: one strong move to win. */
export const START_LEVEL = 1

export interface LadderState {
  /** Current level: how many of your moves you must survive this run to score a win. */
  level: number
  /** Consecutive clean runs at this level; at `winsToAdvance` the level climbs. */
  streak: number
  /** Consecutive busted runs at this level; at `lossesToDemote` the level drops. */
  busts: number
}

export function initLadder(): LadderState {
  return { level: START_LEVEL, streak: 0, busts: 0 }
}

/**
 * Fold a finished run's outcome into the ladder, given how many wins in a row climb a
 * level and how many busts in a row drop one. A win ('max-n') extends the win streak
 * and clears busts; at `winsToAdvance` the level climbs and both reset. A bust
 * ('blunder' / 'budget' / 'forfeit' — a blown move, a spent budget, or a bail to a new
 * position) extends the bust streak and clears wins; at `lossesToDemote` the level drops
 * one (floored at the start) and both reset. Anything else (terminal, or a still-active
 * run) leaves the ladder untouched.
 */
export function advanceLadder(
  state: LadderState,
  status: RunStatus,
  winsToAdvance: number,
  lossesToDemote: number,
): LadderState {
  if (status === 'max-n') {
    const streak = state.streak + 1
    // Guard a junk/zero target so a win always counts for at least one.
    if (streak >= Math.max(1, winsToAdvance)) return { level: state.level + 1, streak: 0, busts: 0 }
    return { level: state.level, streak, busts: 0 }
  }
  if (status === 'blunder' || status === 'budget' || status === 'forfeit') {
    const busts = state.busts + 1
    if (busts >= Math.max(1, lossesToDemote)) {
      return { level: Math.max(START_LEVEL, state.level - 1), streak: 0, busts: 0 }
    }
    return { level: state.level, streak: 0, busts }
  }
  return { level: state.level, streak: state.streak, busts: state.busts }
}

/** Coerce a persisted/dirty value into a valid ladder state. */
export function clampLadder(raw: unknown): LadderState {
  const r = (raw ?? {}) as Record<string, unknown>
  const toInt = (value: unknown, min: number, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
    return Math.max(min, n)
  }
  return {
    level: toInt(r.level, START_LEVEL, START_LEVEL),
    streak: toInt(r.streak, 0, 0),
    busts: toInt(r.busts, 0, 0),
  }
}
