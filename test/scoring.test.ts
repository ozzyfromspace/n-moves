import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RUN_CONFIG,
  applyMove,
  applyTerminal,
  initRun,
  isRunOver,
  moveLoss,
  type RunConfig,
} from '~/lib/scoring'

// Tight, explicit config so end-conditions are easy to reach in a few moves.
const CFG: RunConfig = { budget: 100, blunderCap: 30, maxN: 5 }

describe('moveLoss', () => {
  it('is exactly 0 when the played eval equals best', () => {
    expect(moveLoss({ cp: 40 }, { cp: 40 })).toBe(0)
  })

  it('is the positive win% gap when the played move is worse', () => {
    // Both side-to-move relative for the same player → direct subtraction.
    expect(moveLoss({ cp: 200 }, { cp: -50 })).toBeGreaterThan(0)
  })

  it('clamps to 0 — no refund for "out-playing" the engine', () => {
    // played numerically better than best ⇒ negative gap ⇒ clamped to 0.
    expect(moveLoss({ cp: 0 }, { cp: 300 })).toBe(0)
  })

  it('charges heavily for walking from equal into a mate', () => {
    // best ≈ 55% (cp 50), played 0% (getting mated) ⇒ loss ≈ 55 win%-pts.
    expect(moveLoss({ cp: 50 }, { mate: -3 })).toBeGreaterThan(50)
  })
})

describe('run state machine', () => {
  it('starts active and empty', () => {
    const s = initRun()
    expect(s).toEqual({ n: 0, drift: 0, status: 'active' })
    expect(isRunOver(s)).toBe(false)
  })

  it('accumulates n and drift across scored moves', () => {
    let s = initRun()
    s = applyMove(s, 5, CFG)
    s = applyMove(s, 7, CFG)
    expect(s.n).toBe(2)
    expect(s.drift).toBe(12)
    expect(s.status).toBe('active')
  })

  it('ends as "blunder" when one move loses ≥ blunderCap', () => {
    const s = applyMove(initRun(), 30, CFG)
    expect(s.status).toBe('blunder')
    expect(s.n).toBe(1)
    expect(isRunOver(s)).toBe(true)
  })

  it('ends as "budget" when cumulative drift reaches the budget', () => {
    let s = initRun()
    for (let i = 0; i < 4; i++) s = applyMove(s, 25, CFG) // 25,50,75,100
    expect(s.drift).toBe(100)
    expect(s.status).toBe('budget')
  })

  it('banks "max-n" success when the ply cap is reached cleanly', () => {
    let s = initRun()
    for (let i = 0; i < CFG.maxN; i++) s = applyMove(s, 1, CFG)
    expect(s.n).toBe(CFG.maxN)
    expect(s.status).toBe('max-n')
  })

  it('prefers "blunder" over "budget" when one move trips both', () => {
    let s = initRun()
    s = applyMove(s, 25, CFG) // n1 drift25
    s = applyMove(s, 25, CFG) // n2 drift50
    s = applyMove(s, 25, CFG) // n3 drift75
    s = applyMove(s, 30, CFG) // n4 drift105: blunder AND over budget
    expect(s.drift).toBe(105)
    expect(s.status).toBe('blunder')
  })

  it('prefers a failure over "max-n" on the final ply', () => {
    const cfg: RunConfig = { budget: 40, blunderCap: 30, maxN: 3 }
    let s = initRun()
    s = applyMove(s, 15, cfg) // n1 drift15
    s = applyMove(s, 15, cfg) // n2 drift30
    s = applyMove(s, 15, cfg) // n3 drift45 ≥ budget AND n === maxN
    expect(s.n).toBe(3)
    expect(s.status).toBe('budget')
  })

  it('clamps negative loss before accumulating (no refunds)', () => {
    const s = applyMove(initRun(), -20, CFG)
    expect(s.drift).toBe(0)
    expect(s.status).toBe('active')
  })

  it('is frozen once over — applyMove is a no-op on an ended run', () => {
    const ended = applyMove(initRun(), 30, CFG) // blunder
    const again = applyMove(ended, 5, CFG)
    expect(again).toBe(ended) // identical reference, untouched
    expect(again.n).toBe(1)
  })

  it('falls back to DEFAULT_RUN_CONFIG when none is passed', () => {
    const s = applyMove(initRun(), DEFAULT_RUN_CONFIG.blunderCap)
    expect(s.status).toBe('blunder')
  })
})

describe('applyTerminal', () => {
  it('ends an active run as "terminal" without changing n/drift', () => {
    let s = initRun()
    s = applyMove(s, 8, CFG)
    const t = applyTerminal(s)
    expect(t.status).toBe('terminal')
    expect(t.n).toBe(1)
    expect(t.drift).toBe(8)
  })

  it('does not override an already-ended run', () => {
    const ended = applyMove(initRun(), 30, CFG) // blunder
    expect(applyTerminal(ended).status).toBe('blunder')
  })
})
