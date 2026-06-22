// cp/mate → win probability (0–100), the unit every drift/loss number lives in.
// Pure and dependency-free, so vitest covers it without a worker or a DOM.
//
// Why win% and not raw centipawns: cp is wildly non-linear near zero. +100cp in
// an equal position is a real edge; +100cp on top of +900cp is rounding error.
// The Lichess sigmoid linearises that into an expected score, so a fixed "drift
// budget" means the same thing whether you start equal or defending. The signed
// side-to-move frame is preserved untouched — see lib/uci.ts on the convention.

/** A side-to-move-relative eval exactly as the engine reports it (cp XOR mate). */
export interface EvalScore {
  /** Centipawns, side-to-move relative. Undefined when `mate` is set. */
  cp?: number
  /** Mate in N plies, signed (+ = side to move mates). Undefined when `cp` is set. */
  mate?: number
}

/** Lichess win%/cp constant (current as of 2026). Gives winprob(0) = 50. */
export const WINPROB_K = 0.00368208

/** Past ±1000cp the curve is ~100/0 anyway; clamp keeps it well-behaved. */
export const CP_CLAMP = 1000

/** A mate pins to this (winning) / its complement (losing) — see `evalToWinProb`. */
export const MATE_WINPROB = 100

/** Centipawns (side-to-move) → win% in [0,100]. Clamped at ±1000cp. */
export function cpToWinProb(cp: number): number {
  const c = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-WINPROB_K * c)) - 1)
}

/**
 * Any eval → win%. A forced mate for the side to move is ~100, getting mated is
 * ~0. v0 ignores mate distance: for a "don't lose ground" trainer a forced win
 * is a forced win, so two different mates cost zero loss against each other —
 * depth tie-breaks are a deliberate v1 deferral. `mate 0` means the side to move
 * is already mated, so it reads as a loss, not a win.
 */
export function evalToWinProb(e: EvalScore): number {
  if (e.mate !== undefined) return e.mate > 0 ? MATE_WINPROB : 100 - MATE_WINPROB
  if (e.cp !== undefined) return cpToWinProb(e.cp)
  return 50 // unscored line (shouldn't happen) → treat as dead equal
}
