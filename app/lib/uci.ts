// Pure parsers for the UCI text protocol. No worker/engine state lives here, so
// the scoring loop's math (Task #4) can be unit-tested with vitest without ever
// spawning a worker.
//
// SIGN CONVENTION (the bug magnet): UCI scores are SIDE-TO-MOVE relative — a
// positive cp/mate is good for whoever is to move in the searched position.
// The Lichess eval dump (Task #6) is white-relative instead; converting between
// the two is the likeliest subtle error, so everything here stays in the
// engine's native side-to-move frame and never negates.

export interface UciInfo {
  depth?: number
  selDepth?: number
  nodes?: number
  nps?: number
  timeMs?: number
  /** PV rank under MultiPV (1 = best). Absent/undefined in single-PV searches. */
  multipv?: number
  /** Centipawns, side-to-move relative. Mutually exclusive with `mate`. */
  cp?: number
  /** Mate in N plies, signed: + = side-to-move delivers mate, - = gets mated. */
  mate?: number
  /** Principal variation as long-algebraic moves (e.g. ['e2e4','e7e5']). */
  pv?: string[]
  /** A `cp` qualified by `lowerbound`/`upperbound` (fail-soft window edge). */
  bound?: 'lower' | 'upper'
}

function intAt(tokens: string[], i: number): number | undefined {
  const v = Number(tokens[i])
  return Number.isFinite(v) ? v : undefined
}

/**
 * Parse one `info ...` line. Returns null for lines we don't score on — the
 * lite build also emits `info string ...` and download-progress chatter.
 */
export function parseInfoLine(line: string): UciInfo | null {
  const t = line.trim().split(/\s+/)
  if (t[0] !== 'info') return null
  if (t[1] === 'string') return null

  const info: UciInfo = {}
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': info.depth = intAt(t, ++i); break
      case 'seldepth': info.selDepth = intAt(t, ++i); break
      case 'nodes': info.nodes = intAt(t, ++i); break
      case 'nps': info.nps = intAt(t, ++i); break
      case 'time': info.timeMs = intAt(t, ++i); break
      case 'multipv': info.multipv = intAt(t, ++i); break
      case 'score':
        if (t[i + 1] === 'cp') { info.cp = intAt(t, i + 2); i += 2 }
        else if (t[i + 1] === 'mate') { info.mate = intAt(t, i + 2); i += 2 }
        break
      case 'lowerbound': info.bound = 'lower'; break
      case 'upperbound': info.bound = 'upper'; break
      // `pv` is always last — slurp the rest and stop.
      case 'pv': info.pv = t.slice(i + 1); i = t.length; break
      default: break
    }
  }
  return info
}

export interface BestMove {
  /** Long-algebraic, e.g. 'e2e4', 'e7e8q'. '(none)' for a terminal position. */
  bestmove: string
  ponder?: string
}

export function parseBestMove(line: string): BestMove | null {
  const t = line.trim().split(/\s+/)
  if (t[0] !== 'bestmove' || !t[1]) return null
  const out: BestMove = { bestmove: t[1] }
  const pi = t.indexOf('ponder')
  if (pi !== -1 && t[pi + 1]) out.ponder = t[pi + 1]
  return out
}

export interface UciMove { from: string; to: string; promotion?: string }

/**
 * 'e2e4' → {from,to}; 'e7e8q' → {from,to,promotion:'q'}. Returns null for
 * '(none)' or anything malformed. Bridges engine PV/bestmove → chess.js input.
 */
export function parseUciMove(move: string): UciMove | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move)
  if (!m) return null
  return m[3]
    ? { from: m[1]!, to: m[2]!, promotion: m[3]! }
    : { from: m[1]!, to: m[2]! }
}
