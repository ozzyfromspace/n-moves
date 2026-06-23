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
  /** Win%-pts of erosion allowed per move on average; run budget = this × the level. */
  driftPerMove: number
  /** Clean runs in a row needed at a level before it climbs (the consistency gate). */
  winsToAdvance: number
  /** Busted runs in a row at a level before it drops one (failing has teeth). */
  lossesToDemote: number
  /** A single move losing ≥ this many win%-pts ends the run. */
  blunderCap: number
  /** Eval-range filter in side-to-move cp; null = draw from every bucket. */
  evalRange: [number, number] | null
  /** On a blunder, reveal WHY it loses (the opponent's refutation line). Off = pure
   *  struggle: no post-mortem at all. Never reveals the move you should have played. */
  explainBlunders: boolean
  /** How many of YOUR moves the interactive refutation explorer plays out before it
   *  stops ("you've seen enough") — how deep the post-mortem digs. Captured at entry. */
  explorerSteps: number
}

export const SETTINGS_DEFAULTS: Settings = {
  nodes: 800_000,
  driftPerMove: 1.5,
  winsToAdvance: 3,
  lossesToDemote: 3,
  blunderCap: DEFAULT_RUN_CONFIG.blunderCap,
  evalRange: null,
  explainBlunders: true,
  explorerSteps: 4,
}

interface Bound {
  min: number
  max: number
  /** Slider granularity / rounding unit. */
  step: number
}

/** Inclusive bounds + step for each numeric knob. The UI sliders and the clamp share these. */
export const SETTINGS_BOUNDS: Record<
  'nodes' | 'driftPerMove' | 'winsToAdvance' | 'lossesToDemote' | 'blunderCap' | 'explorerSteps',
  Bound
> = {
  // 200k is still far superhuman; 3M is the slow-but-strong end (see plan).
  nodes: { min: 200_000, max: 3_000_000, step: 100_000 },
  // Win%-pts you may shed per move on average; × the level = the run's drift budget.
  driftPerMove: { min: 0.5, max: 6, step: 0.5 },
  // "Several times in a row" — how consistent you must be before the level climbs.
  winsToAdvance: { min: 1, max: 10, step: 1 },
  // Busts in a row before you drop a level — how unforgiving a cold streak is.
  lossesToDemote: { min: 1, max: 10, step: 1 },
  blunderCap: { min: 5, max: 100, step: 1 },
  // How many of your moves the refutation explorer plays out — a quick taste (2) to a
  // deep demolition (8). Default 4 lands the point without dragging.
  explorerSteps: { min: 2, max: 8, step: 1 },
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
    driftPerMove: clampNum(r.driftPerMove, SETTINGS_BOUNDS.driftPerMove, SETTINGS_DEFAULTS.driftPerMove),
    winsToAdvance: clampNum(r.winsToAdvance, SETTINGS_BOUNDS.winsToAdvance, SETTINGS_DEFAULTS.winsToAdvance),
    lossesToDemote: clampNum(r.lossesToDemote, SETTINGS_BOUNDS.lossesToDemote, SETTINGS_DEFAULTS.lossesToDemote),
    blunderCap: clampNum(r.blunderCap, SETTINGS_BOUNDS.blunderCap, SETTINGS_DEFAULTS.blunderCap),
    evalRange: clampRange(r.evalRange),
    explainBlunders:
      typeof r.explainBlunders === 'boolean' ? r.explainBlunders : SETTINGS_DEFAULTS.explainBlunders,
    explorerSteps: clampNum(r.explorerSteps, SETTINGS_BOUNDS.explorerSteps, SETTINGS_DEFAULTS.explorerSteps),
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
