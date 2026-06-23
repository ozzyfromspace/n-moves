import { describe, expect, it } from 'vitest'
import {
  START_LEVEL,
  advanceLadder,
  clampLadder,
  initLadder,
  type LadderState,
} from '~/lib/ladder'

const WTA = 3
const LTD = 3

describe('initLadder', () => {
  it('starts at level 1 with no streak or busts', () => {
    expect(initLadder()).toEqual({ level: START_LEVEL, streak: 0, busts: 0 })
  })
})

describe('advanceLadder — climbing', () => {
  it('banks a win as a streak step without climbing yet', () => {
    expect(advanceLadder({ level: 1, streak: 0, busts: 0 }, 'max-n', WTA, LTD)).toEqual({
      level: 1,
      streak: 1,
      busts: 0,
    })
  })

  it('climbs a level and resets on the winsToAdvance-th win in a row', () => {
    expect(advanceLadder({ level: 1, streak: 2, busts: 0 }, 'max-n', WTA, LTD)).toEqual({
      level: 2,
      streak: 0,
      busts: 0,
    })
  })

  it('a win clears any accumulated busts', () => {
    expect(advanceLadder({ level: 4, streak: 0, busts: 2 }, 'max-n', WTA, LTD)).toEqual({
      level: 4,
      streak: 1,
      busts: 0,
    })
  })
})

describe('advanceLadder — demoting', () => {
  it('banks a bust as a strike, clearing the win streak, without dropping yet', () => {
    expect(advanceLadder({ level: 4, streak: 2, busts: 0 }, 'blunder', WTA, LTD)).toEqual({
      level: 4,
      streak: 0,
      busts: 1,
    })
  })

  it('drops a level and resets on the lossesToDemote-th bust in a row', () => {
    expect(advanceLadder({ level: 4, streak: 0, busts: 2 }, 'budget', WTA, LTD)).toEqual({
      level: 3,
      streak: 0,
      busts: 0,
    })
  })

  it('never drops below the start level', () => {
    expect(advanceLadder({ level: START_LEVEL, streak: 0, busts: 2 }, 'blunder', WTA, LTD)).toEqual({
      level: START_LEVEL,
      streak: 0,
      busts: 0,
    })
  })
})

describe('advanceLadder — neutral', () => {
  it('leaves the ladder untouched on a terminal board or an unfinished run', () => {
    expect(advanceLadder({ level: 3, streak: 2, busts: 0 }, 'terminal', WTA, LTD)).toEqual({
      level: 3,
      streak: 2,
      busts: 0,
    })
    expect(advanceLadder({ level: 3, streak: 0, busts: 1 }, 'active', WTA, LTD)).toEqual({
      level: 3,
      streak: 0,
      busts: 1,
    })
  })
})

describe('advanceLadder — full arc', () => {
  it('climbs on three clean, then a bust streak drops back down', () => {
    let s: LadderState = { level: 1, streak: 0, busts: 0 }
    s = advanceLadder(s, 'max-n', WTA, LTD)
    s = advanceLadder(s, 'max-n', WTA, LTD)
    s = advanceLadder(s, 'max-n', WTA, LTD) // 3 in a row → level 2
    expect(s).toEqual({ level: 2, streak: 0, busts: 0 })
    s = advanceLadder(s, 'blunder', WTA, LTD)
    s = advanceLadder(s, 'budget', WTA, LTD)
    s = advanceLadder(s, 'blunder', WTA, LTD) // 3 busts → back to level 1
    expect(s).toEqual({ level: 1, streak: 0, busts: 0 })
  })

  it('promotes/demotes on a single run when the threshold is 1 or junk', () => {
    expect(advanceLadder({ level: 2, streak: 0, busts: 0 }, 'max-n', 1, LTD)).toEqual({
      level: 3,
      streak: 0,
      busts: 0,
    })
    expect(advanceLadder({ level: 2, streak: 0, busts: 0 }, 'blunder', WTA, 0)).toEqual({
      level: 1,
      streak: 0,
      busts: 0,
    }) // guarded
  })
})

describe('clampLadder', () => {
  it('coerces missing / junk values to a valid state', () => {
    expect(clampLadder(null)).toEqual({ level: START_LEVEL, streak: 0, busts: 0 })
    expect(clampLadder({ level: 'x', streak: -4, busts: -1 })).toEqual({
      level: START_LEVEL,
      streak: 0,
      busts: 0,
    })
  })

  it('floors the level at the start and rounds', () => {
    expect(clampLadder({ level: 0, streak: 1, busts: 2 })).toEqual({ level: START_LEVEL, streak: 1, busts: 2 })
    expect(clampLadder({ level: 7.6, streak: 2.2, busts: 0.9 })).toEqual({ level: 8, streak: 2, busts: 1 })
  })
})
