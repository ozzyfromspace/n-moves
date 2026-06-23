import { describe, expect, it } from 'vitest'
import {
  SETTINGS_DEFAULTS,
  clampSettings,
  parseSettings,
  serializeSettings,
} from '~/lib/settings'

describe('clampSettings', () => {
  it('returns the defaults for an empty object', () => {
    expect(clampSettings({})).toEqual(SETTINGS_DEFAULTS)
  })

  it('clamps numbers into their bounds', () => {
    const s = clampSettings({
      nodes: 50_000,
      driftPerMove: 99,
      winsToAdvance: 99,
      lossesToDemote: 99,
      blunderCap: 2,
    })
    expect(s.nodes).toBe(200_000) // below min → min
    expect(s.driftPerMove).toBe(6) // above max → max
    expect(s.winsToAdvance).toBe(10) // above max → max
    expect(s.lossesToDemote).toBe(10) // above max → max
    expect(s.blunderCap).toBe(5) // below min → min
  })

  it('snaps nodes to the 100k step', () => {
    expect(clampSettings({ nodes: 840_000 }).nodes).toBe(800_000)
    expect(clampSettings({ nodes: 860_000 }).nodes).toBe(900_000)
  })

  it('snaps drift-per-move to the 0.5 step and floors it', () => {
    expect(clampSettings({ driftPerMove: 1.7 }).driftPerMove).toBe(1.5)
    expect(clampSettings({ driftPerMove: 1.8 }).driftPerMove).toBe(2)
    expect(clampSettings({ driftPerMove: 0.1 }).driftPerMove).toBe(0.5)
  })

  it('falls back to the default for non-finite or wrong-typed values', () => {
    expect(clampSettings({ nodes: 'lots' as unknown as number }).nodes).toBe(SETTINGS_DEFAULTS.nodes)
    expect(clampSettings({ driftPerMove: Number.NaN }).driftPerMove).toBe(SETTINGS_DEFAULTS.driftPerMove)
    expect(clampSettings({ winsToAdvance: 0 }).winsToAdvance).toBe(1) // below min → min
    expect(clampSettings({ lossesToDemote: 0 }).lossesToDemote).toBe(1) // below min → min
  })

  it('orders and clamps the eval range, nulling a full-spectrum span', () => {
    expect(clampSettings({ evalRange: [50, -50] }).evalRange).toEqual([-50, 50]) // reordered
    expect(clampSettings({ evalRange: [-5000, 5000] }).evalRange).toBeNull() // whole spectrum
    expect(clampSettings({ evalRange: [-150, 50] }).evalRange).toEqual([-150, 50])
  })

  it('treats a malformed eval range as no filter', () => {
    expect(clampSettings({ evalRange: [1] as unknown as [number, number] }).evalRange).toBeNull()
    expect(clampSettings({ evalRange: 'bad' as unknown as [number, number] }).evalRange).toBeNull()
  })

  it('keeps explainBlunders when boolean, else falls back to the default', () => {
    expect(clampSettings({ explainBlunders: false }).explainBlunders).toBe(false)
    expect(clampSettings({ explainBlunders: true }).explainBlunders).toBe(true)
    expect(clampSettings({ explainBlunders: 'on' as unknown as boolean }).explainBlunders).toBe(
      SETTINGS_DEFAULTS.explainBlunders,
    )
  })
})

describe('parse / serialize', () => {
  it('round-trips a clamped settings object', () => {
    const s = clampSettings({
      nodes: 1_200_000,
      driftPerMove: 2,
      winsToAdvance: 5,
      lossesToDemote: 4,
      evalRange: [-150, 50],
    })
    expect(parseSettings(serializeSettings(s))).toEqual(s)
  })

  it('returns the defaults on malformed JSON', () => {
    expect(parseSettings('{not json')).toEqual(SETTINGS_DEFAULTS)
  })

  it('clamps junk values found in stored JSON', () => {
    expect(parseSettings('{"nodes": 99}').nodes).toBe(200_000)
  })
})
