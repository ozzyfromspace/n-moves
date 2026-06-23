// Pure helpers for the refutation explorer: turn the engine's MultiPV lines into
// display candidates (figurine SAN + eval), and format one eval from the player's
// perspective. No Vue, no engine — useExplorer.ts adds the board + the loop; this
// file is just the formatting so vitest can pin it. Evals here are ALREADY
// player-perspective: the explorer only asks for lines at the player's own turn,
// where side-to-move = the player, so a negative score means the player is worse
// (which, in a refutation, they always are).

import { evalToWinProb } from '~/lib/winprob'
import { uciToSan, toFigurine } from '~/lib/notation'

/** One try the player can test at the current explorer position. */
export interface ExplorerCandidate {
  /** Long-algebraic move (the line's first move). */
  uci: string
  /** Figurine SAN at the position, or the raw UCI if it won't render. */
  san: string
  /** Centipawns, player-perspective. Undefined when `mate` is set. */
  cp?: number
  /** Mate in N, player-perspective signed (+ = player mates). Undefined when `cp` is set. */
  mate?: number
  /** Player win% (0–100) if this line is played out. */
  winProb: number
  /** The least-bad try (top MultiPV rank) — even this one loses, which is the lesson. */
  best: boolean
}

/** The slice of an engine MultiPV line this module needs. */
export interface RawLine {
  move: string
  cp?: number
  mate?: number
}

/**
 * Build the player's candidate tries from the engine's ranked lines at `fen` (player to
 * move). Lines arrive best-first; the first surviving one is flagged `best`. Drops any
 * line with no real move.
 */
export function buildCandidates(fen: string, lines: RawLine[]): ExplorerCandidate[] {
  return lines
    .filter(l => l.move && l.move !== '(none)')
    .map((l, i) => {
      const san = uciToSan(fen, l.move)
      return {
        uci: l.move,
        san: san ? toFigurine(san) : l.move,
        cp: l.cp,
        mate: l.mate,
        winProb: evalToWinProb({ cp: l.cp, mate: l.mate }),
        best: i === 0,
      }
    })
}

/**
 * One eval, player-perspective, as a compact badge: pawns with an explicit sign
 * (`+1.2`, `−4.2`) or mate (`M3` = player mates in 3, `−M3` = player gets mated in 3).
 * Uses the real minus sign (−) to match the rest of the UI.
 */
export function formatEval(e: { cp?: number; mate?: number }): string {
  if (e.mate !== undefined) return e.mate > 0 ? `M${e.mate}` : `−M${Math.abs(e.mate)}`
  if (e.cp !== undefined) {
    const pawns = Math.abs(e.cp / 100).toFixed(1)
    return e.cp >= 0 ? `+${pawns}` : `−${pawns}`
  }
  return '—'
}
