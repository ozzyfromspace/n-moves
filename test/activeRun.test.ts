import { describe, expect, it } from 'vitest'
import { ACTIVE_RUN_VERSION, isValidActiveRun, type ActiveRun } from '~/lib/activeRun'

const valid = (): ActiveRun => ({
  version: ACTIVE_RUN_VERSION,
  position: { fen: '8/8/8/8/8/8/8/k6K w - - 0 1', cpWhite: 0, sideToMove: 'white', cpStm: 0 },
  humanColor: 'white',
  moves: ['e2e4', 'e7e5'],
  run: { n: 1, drift: 3, status: 'active' },
  winHistory: [55, 52],
  fatalLoss: null,
  playedTarget: 4,
  banked: false,
  bankedAtStart: false,
  nodes: 800_000,
  config: { budget: 6, blunderCap: 8, maxN: 4 },
  currentEval: { cp: 20 },
  phase: 'player',
  runError: null,
})

describe('isValidActiveRun', () => {
  it('accepts a well-formed snapshot', () => {
    expect(isValidActiveRun(valid())).toBe(true)
  })

  it('rejects a stale schema version', () => {
    expect(isValidActiveRun({ ...valid(), version: ACTIVE_RUN_VERSION + 1 })).toBe(false)
  })

  it('rejects non-objects', () => {
    for (const v of [null, undefined, 'x', 42, []]) expect(isValidActiveRun(v)).toBe(false)
  })

  it('rejects a missing or shapeless position', () => {
    expect(isValidActiveRun({ ...valid(), position: null })).toBe(false)
    expect(isValidActiveRun({ ...valid(), position: { cpWhite: 0 } })).toBe(false)
  })

  it('rejects a bad humanColor', () => {
    expect(isValidActiveRun({ ...valid(), humanColor: 'green' })).toBe(false)
  })

  it('rejects non-string moves', () => {
    expect(isValidActiveRun({ ...valid(), moves: [1, 2] })).toBe(false)
    expect(isValidActiveRun({ ...valid(), moves: 'e2e4' })).toBe(false)
  })

  it('rejects a malformed run state', () => {
    expect(isValidActiveRun({ ...valid(), run: { n: 1, drift: 3 } })).toBe(false)
    expect(isValidActiveRun({ ...valid(), run: null })).toBe(false)
  })

  it('rejects an unknown phase', () => {
    expect(isValidActiveRun({ ...valid(), phase: 'scoring' })).toBe(false)
  })

  it('rejects a non-boolean banked / bankedAtStart flag', () => {
    expect(isValidActiveRun({ ...valid(), banked: 'yes' })).toBe(false)
    expect(isValidActiveRun({ ...valid(), banked: undefined })).toBe(false)
    expect(isValidActiveRun({ ...valid(), bankedAtStart: 'no' })).toBe(false)
    expect(isValidActiveRun({ ...valid(), bankedAtStart: undefined })).toBe(false)
  })

  it('accepts a banked (won, locked) run', () => {
    expect(isValidActiveRun({ ...valid(), banked: true, bankedAtStart: true })).toBe(true)
  })

  it('accepts a first-win snapshot (banked but started un-banked)', () => {
    expect(isValidActiveRun({ ...valid(), phase: 'over', banked: true, bankedAtStart: false })).toBe(true)
  })

  it('accepts a finished run', () => {
    expect(isValidActiveRun({ ...valid(), phase: 'over', run: { n: 4, drift: 9, status: 'blunder' } })).toBe(true)
  })
})
