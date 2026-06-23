import {
  normalizeFen,
  pickPosition,
  sideToMoveOf,
  cpToStm,
  type PickOptions,
  type PositionRecord,
} from '~/lib/positions'

// Loads the curated start set and hands ChessTrainer a bucket-balanced draw. The
// real set (public/positions/positions.json) is built offline by
// scripts/build-positions.ts; until it exists the committed sample is used. All the
// sampling/perspective/bucket math is pure in lib/positions (vitest-covered) — this
// composable only adds the fetch, a little reactive state, the recently-served
// no-repeat window, and defensive cleanup of whatever JSON we got.

const FULL_URL = '/positions/positions.json'
const SAMPLE_URL = '/positions/positions.sample.json'

/**
 * Fetch a position array from a same-origin static path. Because this is an SPA,
 * Nitro answers an *unknown* path with the index.html shell (HTTP 200, text/html),
 * not a 404 — so a missing file would otherwise parse as junk. We reject anything
 * that isn't really JSON, which both selects the right file and surfaces the
 * "restart pnpm dev after adding to public/" gotcha as a clean failure.
 */
async function fetchSet(url: string): Promise<PositionRecord[]> {
  const res = await fetch(url)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.includes('json')) {
    throw new Error(`no position JSON at ${url} (got ${res.status} ${type || 'no content-type'})`)
  }
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) throw new Error(`empty position set at ${url}`)
  return data as PositionRecord[]
}

/**
 * Normalise one raw row into a trustworthy PositionRecord: pad the FEN to six
 * fields and re-derive side-to-move and cpStm from cpWhite so a stale or hand-edited
 * file can't feed the loop an inconsistent perspective. Throws if cpWhite is missing.
 */
function clean(raw: PositionRecord): PositionRecord {
  const fen = normalizeFen(raw.fen)
  if (typeof raw.cpWhite !== 'number') throw new Error(`row missing cpWhite: ${raw.fen}`)
  const sideToMove = sideToMoveOf(fen)
  return { fen, cpWhite: raw.cpWhite, sideToMove, cpStm: cpToStm(raw.cpWhite, sideToMove) }
}

export function usePositions() {
  const records = shallowRef<PositionRecord[]>([])
  const ready = ref(false)
  const error = ref<string | null>(null)
  // True when the full set couldn't be fetched and we fell back to the committed
  // sample (~11 starts). In production that means /positions/positions.json isn't
  // deployed; the app still runs, but on a tiny pool — so the trainer surfaces it
  // instead of letting a thin deploy quietly masquerade as the full library.
  const usingSample = ref(false)
  const count = computed(() => records.value.length)

  // Recently-served FENs (newest last). pick() avoids these so the same start can't
  // resurface back-to-back; the window is bounded below the pool size so a draw is
  // always available — the in-session half of "keep positions fresh".
  const recent: string[] = []

  /** Load the best available set: the full built file, else the committed sample. */
  async function load(): Promise<void> {
    ready.value = false
    error.value = null
    usingSample.value = false
    try {
      let raw: PositionRecord[]
      try {
        raw = await fetchSet(FULL_URL)
      } catch (fullErr) {
        // Full set missing (not built yet, dev server needs a restart, or — in
        // production — positions.json isn't deployed). Fall back to the sample,
        // but say so loudly: a silent fallback reads as "the app works" while
        // quietly serving a handful of starts on repeat.
        raw = await fetchSet(SAMPLE_URL)
        usingSample.value = true
        console.warn(
          `[n-moves] Full position set unavailable (${(fullErr as Error).message}). ` +
            `Falling back to the ${raw.length}-position sample, so starts will repeat. ` +
            `In production this means /positions/positions.json isn't deployed — redeploy to ship it.`,
        )
      }
      records.value = raw.map(clean)
      ready.value = true
    } catch (e) {
      error.value = `${(e as Error).message}. If you just added public/positions/, restart \`pnpm dev\`.`
    }
  }

  /** Draw a start (bucket-balanced, recently-served starts skipped); null if nothing matches. */
  function pick(opts?: PickOptions): PositionRecord | null {
    const exclude = recent.length > 0 ? new Set(recent) : undefined
    const pos = pickPosition(records.value, { ...opts, exclude })
    if (pos) {
      recent.push(pos.fen)
      // Keep the no-repeat window strictly under the pool so a fresh draw always exists.
      const cap = Math.max(0, Math.min(50, records.value.length - 1))
      while (recent.length > cap) recent.shift()
    }
    return pos
  }

  return { records, ready, error, usingSample, count, load, pick }
}
