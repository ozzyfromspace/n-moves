import { describe, expect, it } from 'vitest'
import { CP_CLAMP, MATE_WINPROB, cpToWinProb, evalToWinProb } from '~/lib/winprob'

describe('cpToWinProb', () => {
  it('maps 0cp to exactly 50%', () => {
    expect(cpToWinProb(0)).toBe(50)
  })

  it('is symmetric about 50%: winprob(cp) + winprob(-cp) = 100', () => {
    for (const cp of [25, 100, 350, 800, 1500]) {
      expect(cpToWinProb(cp) + cpToWinProb(-cp)).toBeCloseTo(100, 9)
    }
  })

  it('is strictly monotonic increasing in cp', () => {
    const pts = [-1000, -300, -50, 0, 50, 300, 1000].map(cpToWinProb)
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!).toBeGreaterThan(pts[i - 1]!)
    }
  })

  it('matches the Lichess sigmoid at +100cp (~59.1%)', () => {
    expect(cpToWinProb(100)).toBeCloseTo(59.1, 1)
  })

  it('clamps beyond ±1000cp', () => {
    expect(cpToWinProb(5000)).toBe(cpToWinProb(CP_CLAMP))
    expect(cpToWinProb(-5000)).toBe(cpToWinProb(-CP_CLAMP))
  })

  it('stays inside [0,100] even at absurd inputs', () => {
    for (const cp of [-100_000, -1000, 0, 1000, 100_000]) {
      const w = cpToWinProb(cp)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(100)
    }
  })
})

describe('evalToWinProb', () => {
  it('delegates cp scores to the sigmoid', () => {
    expect(evalToWinProb({ cp: 100 })).toBe(cpToWinProb(100))
  })

  it('pins a winning mate to ~100 and a losing mate to ~0', () => {
    expect(evalToWinProb({ mate: 1 })).toBe(MATE_WINPROB)
    expect(evalToWinProb({ mate: 8 })).toBe(MATE_WINPROB)
    expect(evalToWinProb({ mate: -2 })).toBe(100 - MATE_WINPROB)
  })

  it('treats mate 0 (the side to move is already mated) as a loss', () => {
    expect(evalToWinProb({ mate: 0 })).toBe(100 - MATE_WINPROB)
  })

  it('ranks a forced mate above any clamped cp advantage', () => {
    expect(evalToWinProb({ mate: 5 })).toBeGreaterThan(evalToWinProb({ cp: 100_000 }))
  })
})
