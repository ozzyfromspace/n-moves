import { describe, it, expect } from 'vitest'
import { parseInfoLine, parseBestMove } from '~/lib/uci'

describe('parseInfoLine — MultiPV', () => {
  it('reads the multipv rank alongside the score and pv', () => {
    const info = parseInfoLine(
      'info depth 20 multipv 2 score cp -85 nodes 800000 pv e2e4 e7e5 g1f3',
    )
    expect(info).not.toBeNull()
    expect(info!.multipv).toBe(2)
    expect(info!.cp).toBe(-85)
    expect(info!.pv).toEqual(['e2e4', 'e7e5', 'g1f3'])
  })

  it('leaves multipv undefined for a single-PV line', () => {
    const info = parseInfoLine('info depth 18 score cp 30 pv d2d4')
    expect(info!.multipv).toBeUndefined()
    expect(info!.cp).toBe(30)
  })

  it('reads a mate score on a ranked line', () => {
    const info = parseInfoLine('info depth 30 multipv 1 score mate 3 pv f3f7 e8f7 d1f3')
    expect(info!.multipv).toBe(1)
    expect(info!.mate).toBe(3)
  })
})

describe('parseBestMove', () => {
  it('still reads bestmove + ponder unchanged', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({
      bestmove: 'e2e4',
      ponder: 'e7e5',
    })
  })
})
