import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import {
  BUCKET_KEYS,
  BUCKET_RANGES,
  bucketOf,
  bucketsToRange,
  cpToStm,
  normalizeFen,
  pickPosition,
  rangeToBuckets,
  sideToMoveOf,
  type Bucket,
  type PositionRecord,
} from '~/lib/positions'

// Deterministic stand-in for Math.random: replays a fixed sequence so a balanced
// draw (bucket pick, then record pick) is fully predictable.
function seq(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('bucketOf', () => {
  it('maps representative evals to the right band', () => {
    expect(bucketOf(-400)).toBe('defending')
    expect(bucketOf(-100)).toBe('worse')
    expect(bucketOf(0)).toBe('equal')
    expect(bucketOf(100)).toBe('better')
    expect(bucketOf(400)).toBe('winning')
  })

  it('partitions the boundaries with no gap or overlap', () => {
    // Each boundary lands in exactly the bucket the bounds claim.
    expect(bucketOf(-800)).toBe('defending')
    expect(bucketOf(-150)).toBe('worse') // -150 belongs to worse, not defending
    expect(bucketOf(-50)).toBe('equal') // -50 belongs to equal, not worse
    expect(bucketOf(50)).toBe('equal') // both ends of equal are inclusive
    expect(bucketOf(51)).toBe('better')
    expect(bucketOf(150)).toBe('better')
    expect(bucketOf(151)).toBe('winning')
    expect(bucketOf(800)).toBe('winning')
  })

  it('drops positions past the keep limit as null', () => {
    expect(bucketOf(801)).toBeNull()
    expect(bucketOf(-801)).toBeNull()
    expect(bucketOf(5000)).toBeNull()
  })
})

describe('cpToStm', () => {
  it('keeps White-relative cp as-is when White moves', () => {
    expect(cpToStm(120, 'white')).toBe(120)
  })

  it('negates for the side to move when Black moves', () => {
    expect(cpToStm(120, 'black')).toBe(-120)
  })
})

describe('sideToMoveOf', () => {
  it('reads the side from the FEN, defaulting to white', () => {
    expect(sideToMoveOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('white')
    expect(sideToMoveOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('black')
  })
})

describe('normalizeFen', () => {
  it('appends "0 1" to a four-field dump FEN', () => {
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    )
  })

  it('fills only the fullmove counter for a five-field FEN', () => {
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 1',
    )
  })

  it('leaves a full six-field FEN untouched', () => {
    const full = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 3 7'
    expect(normalizeFen(full)).toBe(full)
  })
})

describe('bucket ranges', () => {
  const order: Bucket[] = ['defending', 'worse', 'equal', 'better', 'winning']

  it('partitions [-800, 800] with no gap or overlap', () => {
    for (let i = 1; i < order.length; i++) {
      // each band starts exactly one cp above where the previous one ended
      expect(BUCKET_RANGES[order[i]!][0]).toBe(BUCKET_RANGES[order[i - 1]!][1] + 1)
    }
    expect(BUCKET_RANGES.defending[0]).toBe(-800)
    expect(BUCKET_RANGES.winning[1]).toBe(800)
  })

  it('agrees with bucketOf at both edges of every band', () => {
    for (const b of BUCKET_KEYS) {
      const [lo, hi] = BUCKET_RANGES[b]
      expect(bucketOf(lo), `${b} lo`).toBe(b)
      expect(bucketOf(hi), `${b} hi`).toBe(b)
    }
  })

  it('bucketsToRange spans from..to, order-independent, full span → null', () => {
    expect(bucketsToRange('defending', 'winning')).toBeNull() // whole spectrum = no filter
    expect(bucketsToRange('winning', 'defending')).toBeNull()
    expect(bucketsToRange('equal', 'equal')).toEqual([-50, 50])
    expect(bucketsToRange('worse', 'better')).toEqual([-150, 150])
    expect(bucketsToRange('better', 'worse')).toEqual([-150, 150])
  })

  it('rangeToBuckets inverts a stored range (full when null)', () => {
    expect(rangeToBuckets(null)).toEqual({ from: 'defending', to: 'winning' })
    expect(rangeToBuckets([-50, 50])).toEqual({ from: 'equal', to: 'equal' })
    expect(rangeToBuckets([-150, 150])).toEqual({ from: 'worse', to: 'better' })
    expect(rangeToBuckets(bucketsToRange('defending', 'equal'))).toEqual({
      from: 'defending',
      to: 'equal',
    })
  })
})

describe('pickPosition', () => {
  const rec = (cpStm: number): PositionRecord => ({
    fen: 'x',
    cpWhite: cpStm,
    sideToMove: 'white',
    cpStm,
  })

  it('returns null from an empty set', () => {
    expect(pickPosition([])).toBeNull()
  })

  it('balances across buckets, not raw frequency', () => {
    // Two equal, one winning. A flat draw favours equal 2:1; balanced gives each
    // bucket an even shot — forcing the bucket index to 1 returns the lone winner.
    const records = [rec(0), rec(10), rec(300)] // buckets: equal, equal, winning
    // bucket index floor(0.99 * 2) = 1 (winning); record index floor(0 * 1) = 0.
    expect(pickPosition(records, {}, seq([0.99, 0]))?.cpStm).toBe(300)
    // bucket index floor(0 * 2) = 0 (equal); record index floor(0 * 2) = 0.
    expect(pickPosition(records, {}, seq([0, 0]))?.cpStm).toBe(0)
  })

  it('honours the eval-range filter and never returns out-of-range starts', () => {
    const records = [rec(-30), rec(0), rec(300)]
    const picked = pickPosition(records, { range: [-50, 50] }, seq([0, 0]))
    expect(picked).not.toBeNull()
    expect(picked!.cpStm).not.toBe(300)
    expect(picked!.cpStm).toBeGreaterThanOrEqual(-50)
  })

  it('returns null when the range matches nothing', () => {
    expect(pickPosition([rec(0), rec(10)], { range: [400, 800] })).toBeNull()
  })

  it('draws flat when balancing is off', () => {
    const records = [rec(0), rec(10), rec(300)]
    expect(pickPosition(records, { balanced: false }, seq([0]))?.cpStm).toBe(0)
  })
})

describe('positions.sample.json', () => {
  const sample: PositionRecord[] = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../public/positions/positions.sample.json', import.meta.url)),
      'utf8',
    ),
  )

  it('is a non-empty array', () => {
    expect(Array.isArray(sample)).toBe(true)
    expect(sample.length).toBeGreaterThan(0)
  })

  it('every row is a legal, non-terminal position with a real decision', () => {
    for (const r of sample) {
      const game = new Chess(r.fen) // throws on a malformed FEN
      expect(game.isGameOver(), `${r.fen} is terminal`).toBe(false)
      expect(game.moves().length, `${r.fen} has no legal move`).toBeGreaterThan(0)
    }
  })

  it('every row has a consistent perspective and is within a kept bucket', () => {
    for (const r of sample) {
      expect(sideToMoveOf(r.fen), `${r.fen} side mismatch`).toBe(r.sideToMove)
      expect(cpToStm(r.cpWhite, r.sideToMove), `${r.fen} cpStm mismatch`).toBe(r.cpStm)
      expect(bucketOf(r.cpStm), `${r.fen} out of bucket`).not.toBeNull()
    }
  })

  it('spans the eval spectrum (at least four of the five buckets)', () => {
    const covered = new Set<Bucket>()
    for (const r of sample) {
      const b = bucketOf(r.cpStm)
      if (b) covered.add(b)
    }
    expect(covered.size).toBeGreaterThanOrEqual(4)
    // Sanity: every covered bucket is a known key.
    for (const b of covered) expect(BUCKET_KEYS).toContain(b)
  })
})
