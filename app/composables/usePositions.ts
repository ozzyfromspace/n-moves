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
// composable only adds the fetch, a little reactive state, and defensive cleanup of
// whatever JSON we got.

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
  const count = computed(() => records.value.length)

  /** Load the best available set: the full built file, else the committed sample. */
  async function load(): Promise<void> {
    ready.value = false
    error.value = null
    try {
      let raw: PositionRecord[]
      try {
        raw = await fetchSet(FULL_URL)
      } catch {
        raw = await fetchSet(SAMPLE_URL) // not built yet (or dev server needs a restart)
      }
      records.value = raw.map(clean)
      ready.value = true
    } catch (e) {
      error.value = `${(e as Error).message}. If you just added public/positions/, restart \`pnpm dev\`.`
    }
  }

  /** Draw a start (bucket-balanced by default); null if nothing is loaded/matches. */
  function pick(opts?: PickOptions): PositionRecord | null {
    return pickPosition(records.value, opts)
  }

  return { records, ready, error, count, load, pick }
}
