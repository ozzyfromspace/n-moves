import { describe, it, expect } from 'vitest'
import { buildCandidates, formatEval } from '~/lib/explorer'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('buildCandidates', () => {
  it('renders figurine SAN and flags the top line as the best try', () => {
    const cands = buildCandidates(START, [
      { move: 'g1f3', cp: 20 },
      { move: 'e2e4', cp: 30 },
    ])
    expect(cands.map(c => c.san)).toEqual(['♞f3', 'e4'])
    expect(cands[0]!.best).toBe(true)
    expect(cands[1]!.best).toBe(false)
    expect(cands[0]!.uci).toBe('g1f3')
  })

  it('carries the player-perspective eval into a win%', () => {
    // +30cp for the side to move → above 50%.
    const [c] = buildCandidates(START, [{ move: 'e2e4', cp: 30 }])
    expect(c!.cp).toBe(30)
    expect(c!.winProb).toBeGreaterThan(50)
  })

  it('drops lines with no real move, re-flagging the first survivor as best', () => {
    const cands = buildCandidates(START, [
      { move: '(none)' },
      { move: 'e2e4', cp: 30 },
      { move: 'd2d4', cp: 25 },
    ])
    expect(cands).toHaveLength(2)
    expect(cands[0]!.uci).toBe('e2e4')
    expect(cands[0]!.best).toBe(true)
  })

  it('falls back to raw UCI when a move is illegal at the position', () => {
    const [c] = buildCandidates(START, [{ move: 'e2e5' }]) // not a legal first move
    expect(c!.san).toBe('e2e5')
  })
})

describe('formatEval', () => {
  it('formats centipawns as signed pawns', () => {
    expect(formatEval({ cp: 120 })).toBe('+1.2')
    expect(formatEval({ cp: -420 })).toBe('−4.2') // real minus sign (U+2212)
    expect(formatEval({ cp: 0 })).toBe('+0.0')
  })

  it('formats mate from the player perspective', () => {
    expect(formatEval({ mate: 3 })).toBe('M3') // player mates in 3
    expect(formatEval({ mate: -2 })).toBe('−M2') // player gets mated in 2
  })

  it('shows a dash when neither score is present', () => {
    expect(formatEval({})).toBe('—')
  })
})
