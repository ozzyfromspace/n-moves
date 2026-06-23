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
    const s = clampSettings({ nodes: 50_000, budget: 1000, blunderCap: 2, maxN: 7, slipThreshold: 99 })
    expect(s.nodes).toBe(200_000) // below min → min
    expect(s.budget).toBe(400) // above max → max
    expect(s.blunderCap).toBe(5) // below min → min
    expect(s.maxN).toBe(10) // below min → min
    expect(s.slipThreshold).toBe(50) // above max → max
  })

  it('snaps nodes to the 100k step', () => {
    expect(clampSettings({ nodes: 840_000 }).nodes).toBe(800_000)
    expect(clampSettings({ nodes: 860_000 }).nodes).toBe(900_000)
  })

  it('falls back to the default for non-finite or wrong-typed values', () => {
    expect(clampSettings({ nodes: 'lots' as unknown as number }).nodes).toBe(SETTINGS_DEFAULTS.nodes)
    expect(clampSettings({ budget: Number.NaN }).budget).toBe(SETTINGS_DEFAULTS.budget)
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
})

describe('parse / serialize', () => {
  it('round-trips a clamped settings object', () => {
    const s = clampSettings({ nodes: 1_200_000, budget: 80, evalRange: [-150, 50] })
    expect(parseSettings(serializeSettings(s))).toEqual(s)
  })

  it('returns the defaults on malformed JSON', () => {
    expect(parseSettings('{not json')).toEqual(SETTINGS_DEFAULTS)
  })

  it('clamps junk values found in stored JSON', () => {
    expect(parseSettings('{"nodes": 99}').nodes).toBe(200_000)
  })
})
