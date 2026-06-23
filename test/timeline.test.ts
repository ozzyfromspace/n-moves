import { describe, expect, it } from 'vitest'
import { buildTimeline } from '~/lib/timeline'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('buildTimeline', () => {
  it('returns just the start frame for no moves', () => {
    const t = buildTimeline(START, [])
    expect(t).toHaveLength(1)
    expect(t[0]!.fen).toBe(START)
    expect(t[0]!.turnColor).toBe('white')
    expect(t[0]!.lastMove).toBeUndefined()
    expect(t[0]!.check).toBe(false)
  })

  it('emits one frame per ply with alternating side to move', () => {
    const t = buildTimeline(START, ['e2e4', 'e7e5', 'g1f3'])
    expect(t).toHaveLength(4) // start + 3 plies
    expect(t.map(f => f.turnColor)).toEqual(['white', 'black', 'white', 'black'])
  })

  it('records each frame\'s producing move as [from, to]', () => {
    const t = buildTimeline(START, ['e2e4', 'e7e5'])
    expect(t[0]!.lastMove).toBeUndefined()
    expect(t[1]!.lastMove).toEqual(['e2', 'e4'])
    expect(t[2]!.lastMove).toEqual(['e7', 'e5'])
  })

  it('advances the FEN move-by-move', () => {
    const t = buildTimeline(START, ['e2e4'])
    expect(t[1]!.fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b')).toBe(true)
  })

  it('flags check', () => {
    // Scholar's-mate finish: Qxf7# leaves Black to move and in check.
    const t = buildTimeline(START, ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'])
    expect(t[t.length - 1]!.check).toBe(true)
  })

  it('handles a promotion ply', () => {
    const t = buildTimeline('8/P7/8/8/8/8/8/k6K w - - 0 1', ['a7a8q'])
    expect(t).toHaveLength(2)
    expect(t[1]!.lastMove).toEqual(['a7', 'a8'])
    expect(t[1]!.fen.startsWith('Q7/8/8/8/8/8/8/k6K b')).toBe(true)
  })

  it('stops early on an illegal/malformed ply, keeping the good prefix', () => {
    const t = buildTimeline(START, ['e2e4', 'e7e5', 'e2e4' /* now illegal */, 'g1f3'])
    expect(t).toHaveLength(3) // start + 2 legal plies; the bad one halts the walk
  })
})
