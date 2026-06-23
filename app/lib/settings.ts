// The user-tunable run settings and the pure helpers that keep them honest:
// bounds for every knob, a clamp that coerces any stored/typed value back into
// range, and JSON (de)serialisation for localStorage. No Vue here — useSettings.ts
// adds the reactive state and the persistence watcher; this file is just the
// schema and arithmetic so vitest can pin the clamping. Defaults mirror the
// engine/run defaults (lib/scoring + useScoring) so "reset" returns to the shipped
// behaviour exactly.

import { DEFAULT_RUN_CONFIG } from '~/lib/scoring'
import { CP_KEEP_LIMIT } from '~/lib/positions'

export interface Settings {
  /** Fixed engine search work per move (nodes) — strength ↔ latency. */
  nodes: number
  /** Cumulative win%-pts of drift a run absorbs before it ends. */
  budget: number
  /** A single move losing ≥ this many win%-pts ends the run. */
  blunderCap: number
  /** Plies survived to bank a run as a success. */
  maxN: number
  /** Win%-pts lost on one move before the slip overlay shows (display only). */
  slipThreshold: number
  /** Eval-range filter in side-to-move cp; null = draw from every bucket. */
  evalRange: [number, number] | null
}

export const SETTINGS_DEFAULTS: Settings = {
  nodes: 800_000,
  budget: DEFAULT_RUN_CONFIG.budget,
  blunderCap: DEFAULT_RUN_CONFIG.blunderCap,
  maxN: DEFAULT_RUN_CONFIG.maxN,
  slipThreshold: 6,
  evalRange: null,
}

interface Bound {
  min: number
  max: number
  /** Slider granularity / rounding unit. */
  step: number
}

/** Inclusive bounds + step for each numeric knob. The UI sliders and the clamp share these. */
export const SETTINGS_BOUNDS: Record<
  'nodes' | 'budget' | 'blunderCap' | 'maxN' | 'slipThreshold',
  Bound
> = {
  // 200k is still far superhuman; 3M is the slow-but-strong end (see plan).
  nodes: { min: 200_000, max: 3_000_000, step: 100_000 },
  budget: { min: 20, max: 400, step: 5 },
  blunderCap: { min: 5, max: 100, step: 1 },
  maxN: { min: 10, max: 200, step: 5 },
  slipThreshold: { min: 1, max: 50, step: 1 },
}

/** Coerce one value into [min, max], snapped to `step`, falling back when it's junk. */
function clampNum(value: unknown, b: Bound, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const snapped = Math.round(n / b.step) * b.step
  return Math.min(b.max, Math.max(b.min, snapped))
}

/** Coerce an eval-range tuple: order it, clamp to the kept span, full-span → null. */
function clampRange(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [a, b] = value as [unknown, unknown]
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) {
    return null
  }
  const lo = Math.max(-CP_KEEP_LIMIT, Math.round(Math.min(a, b)))
  const hi = Math.min(CP_KEEP_LIMIT, Math.round(Math.max(a, b)))
  if (lo <= -CP_KEEP_LIMIT && hi >= CP_KEEP_LIMIT) return null // whole spectrum = no filter
  return [lo, hi]
}

/** Force any partial/dirty object into a complete, in-range Settings. */
export function clampSettings(raw: Partial<Settings> | Record<string, unknown>): Settings {
  const r = raw as Record<string, unknown>
  return {
    nodes: clampNum(r.nodes, SETTINGS_BOUNDS.nodes, SETTINGS_DEFAULTS.nodes),
    budget: clampNum(r.budget, SETTINGS_BOUNDS.budget, SETTINGS_DEFAULTS.budget),
    blunderCap: clampNum(r.blunderCap, SETTINGS_BOUNDS.blunderCap, SETTINGS_DEFAULTS.blunderCap),
    maxN: clampNum(r.maxN, SETTINGS_BOUNDS.maxN, SETTINGS_DEFAULTS.maxN),
    slipThreshold: clampNum(r.slipThreshold, SETTINGS_BOUNDS.slipThreshold, SETTINGS_DEFAULTS.slipThreshold),
    evalRange: clampRange(r.evalRange),
  }
}

/** Parse persisted JSON into clamped Settings; defaults on anything malformed. */
export function parseSettings(json: string): Settings {
  try {
    return clampSettings(JSON.parse(json) as Record<string, unknown>)
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings)
}
