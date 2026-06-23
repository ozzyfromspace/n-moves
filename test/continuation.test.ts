import { describe, it, expect } from 'vitest'
import { continuationOutcome, continuationVerdict } from '~/lib/continuation'

describe('continuationOutcome', () => {
  it('reads max-n as held and budget/blunder as the two ways it gets away', () => {
    expect(continuationOutcome('max-n', null, 'white')).toBe('held')
    expect(continuationOutcome('budget', null, 'white')).toBe('busted')
    expect(continuationOutcome('blunder', null, 'white')).toBe('slipped')
  })

  it('splits a terminal ending by who delivered mate', () => {
    expect(continuationOutcome('terminal', 'white', 'white')).toBe('converted') // you mated
    expect(continuationOutcome('terminal', 'black', 'white')).toBe('collapsed') // you got mated
    expect(continuationOutcome('terminal', null, 'white')).toBe('drawn') // stalemate / draw
  })

  it('reads the human side correctly when playing black', () => {
    expect(continuationOutcome('terminal', 'black', 'black')).toBe('converted')
    expect(continuationOutcome('terminal', 'white', 'black')).toBe('collapsed')
  })
})

describe('continuationVerdict', () => {
  it('tones the good outcomes positive', () => {
    expect(continuationVerdict('held', 4).tone).toBe('good')
    expect(continuationVerdict('converted', 4).tone).toBe('good')
    expect(continuationVerdict('held', 4).headline).toContain('had it')
  })

  it('tones the failures negative', () => {
    expect(continuationVerdict('slipped', 4).tone).toBe('bad')
    expect(continuationVerdict('busted', 4).tone).toBe('bad')
    expect(continuationVerdict('collapsed', 4).tone).toBe('bad')
  })

  it('keeps a draw neutral', () => {
    expect(continuationVerdict('drawn', 4).tone).toBe('neutral')
  })

  it('folds the step count into the held detail', () => {
    expect(continuationVerdict('held', 6).detail).toContain('6')
  })
})
