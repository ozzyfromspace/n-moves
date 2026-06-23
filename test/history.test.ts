import { describe, expect, it } from 'vitest'
import { RUN_STATUS_SHORT, bestNOf, isHeld, type RunRecord } from '~/lib/history'
import type { RunStatus } from '~/lib/scoring'

const run = (n: number, status: RunStatus = 'budget'): RunRecord => ({
  at: 0,
  n,
  drift: 0,
  status,
  startFen: '-',
  nodes: 0,
  budget: 0,
  blunderCap: 0,
  maxN: 0,
})

describe('bestNOf', () => {
  it('is 0 for an empty history', () => {
    expect(bestNOf([])).toBe(0)
  })

  it('takes the maximum n across runs', () => {
    expect(bestNOf([run(3), run(9), run(7)])).toBe(9)
  })
})

describe('isHeld', () => {
  it('is true only for a held (max-n) run', () => {
    expect(isHeld('max-n')).toBe(true)
    expect(isHeld('blunder')).toBe(false)
    expect(isHeld('budget')).toBe(false)
    expect(isHeld('terminal')).toBe(false)
  })
})

describe('RUN_STATUS_SHORT', () => {
  it('labels every run status', () => {
    const all: RunStatus[] = ['active', 'max-n', 'blunder', 'budget', 'terminal']
    for (const s of all) expect(RUN_STATUS_SHORT[s]).toBeTruthy()
  })
})
