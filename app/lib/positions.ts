// The position dataset's shape and the pure helpers around it: eval buckets (so a
// run can be drawn from defending↔equal↔winning regardless of how skewed the raw
// source is), the white-relative↔side-to-move perspective flip, FEN normalisation
// (the Lichess dump drops the move counters), and bucket-balanced sampling. No Vue,
// no chess.js, no fetch here — usePositions.ts wraps this with reactivity and a
// loader, scripts/build-positions.ts reuses the SAME buckets so the built set and
// the app agree. vitest covers all of it.
//
// The stored eval only drives bucketing and the "how you start" label; the live
// engine re-scores every position during play, so a slightly-off cp never affects
// the actual loss/drift — it just decides which difficulty band a start lands in.

/** A curated start: a full FEN plus its eval from both perspectives. */
export interface PositionRecord {
  /** Full 6-field FEN (move counters present — see `normalizeFen`). */
  fen: string
  /** Eval in centipawns, White's perspective (+ = White better). The dump's native frame. */
  cpWhite: number
  /** Side to move at this position (board orients to this side — the player). */
  sideToMove: 'white' | 'black'
  /** Eval in centipawns, side-to-move's perspective (cpWhite negated when Black moves). */
  cpStm: number
}

// Eval buckets in side-to-move centipawns, ordered worst→best. They partition the
// kept range [-800, 800] with no gaps or overlaps; |cp| > 800 is excluded as too
// decisive for a "don't lose ground" exercise (and mate-y noise). Bounds: defending
// [-800,-150), worse [-150,-50), equal [-50,50], better (50,150], winning (150,800].
export const BUCKET_KEYS = ['defending', 'worse', 'equal', 'better', 'winning'] as const

export type Bucket = (typeof BUCKET_KEYS)[number]

export const BUCKET_LABELS: Record<Bucket, string> = {
  defending: 'Defending',
  worse: 'Slightly worse',
  equal: 'Equal',
  better: 'Slightly better',
  winning: 'Winning',
}

/** Furthest-from-zero |cpStm| a start may carry; beyond this it's degenerate. */
export const CP_KEEP_LIMIT = 800

/**
 * Which eval band `cpStm` (side-to-move centipawns) falls in, or null when it's
 * outside the kept range (|cp| > 800) and should be dropped. The boundaries are
 * arranged so every value in [-800, 800] lands in exactly one bucket.
 */
export function bucketOf(cpStm: number): Bucket | null {
  if (cpStm < -CP_KEEP_LIMIT) return null
  if (cpStm < -150) return 'defending'
  if (cpStm < -50) return 'worse'
  if (cpStm <= 50) return 'equal'
  if (cpStm <= 150) return 'better'
  if (cpStm <= CP_KEEP_LIMIT) return 'winning'
  return null
}

/** The side to move as read from a FEN's second field. Defaults to white if absent. */
export function sideToMoveOf(fen: string): 'white' | 'black' {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white'
}

/** White-relative cp → side-to-move cp: negate when Black is to move. */
export function cpToStm(cpWhite: number, sideToMove: 'white' | 'black'): number {
  return sideToMove === 'black' ? -cpWhite : cpWhite
}

/**
 * Pad a FEN to the full six fields. The Lichess eval dump often ships only the
 * first four (board, side, castling, en-passant) with no halfmove/fullmove
 * counters; chess.js and chessground want all six, so fill in '0 1'. A FEN that
 * already has its counters is returned untouched (trimmed to six fields).
 */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/)
  if (parts.length >= 6) return parts.slice(0, 6).join(' ')
  while (parts.length < 6) parts.push(parts.length === 4 ? '0' : '1')
  return parts.join(' ')
}

export interface PickOptions {
  /** Restrict to starts with cpStm within [min, max] inclusive (the settings filter). */
  range?: [number, number]
  /** Draw evenly across populated buckets rather than by raw frequency. Default true. */
  balanced?: boolean
}

/**
 * Choose one start. By default the draw is *bucket-balanced*: a populated bucket is
 * picked uniformly, then a record within it — so the run difficulty spans the bands
 * evenly even when the underlying set is lopsided. `range` narrows the eligible pool
 * first (the eval-range filter from settings); `balanced: false` falls back to a flat
 * uniform draw. Returns null when nothing matches. `rnd` is injectable so tests are
 * deterministic; the app leaves it as Math.random.
 */
export function pickPosition(
  records: PositionRecord[],
  opts: PickOptions = {},
  rnd: () => number = Math.random,
): PositionRecord | null {
  const pool = opts.range
    ? records.filter(r => r.cpStm >= opts.range![0] && r.cpStm <= opts.range![1])
    : records
  if (pool.length === 0) return null

  const flat = (rows: PositionRecord[]) => rows[Math.floor(rnd() * rows.length)]!
  if (opts.balanced === false) return flat(pool)

  const byBucket = new Map<Bucket, PositionRecord[]>()
  for (const r of pool) {
    const b = bucketOf(r.cpStm)
    if (!b) continue
    const arr = byBucket.get(b)
    if (arr) arr.push(r)
    else byBucket.set(b, [r])
  }
  const buckets = [...byBucket.keys()]
  // Everything in-range was out-of-bucket (|cp| > 800) — just draw flat.
  if (buckets.length === 0) return flat(pool)
  const bucket = buckets[Math.floor(rnd() * buckets.length)]!
  return flat(byBucket.get(bucket)!)
}
