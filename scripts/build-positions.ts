// OFFLINE dataset builder: stream the Lichess evaluations dump → bucketed sample →
// public/positions/positions.json. Run rarely; the app ships with the committed
// positions.sample.json so it never depends on this having run.
//
// Usage — runs under Node's TypeScript stripping (Node ≥ 22.6; ≥ 23 runs .ts directly).
// Invoke node directly so the args reach the script — `pnpm run` forwards a literal
// `--` that parseArgs then rejects as a positional:
//   node --experimental-strip-types scripts/build-positions.ts --per-bucket 2000 --max-lines 8000000
//
// Decompression: this uses node's native zstd, but some Node builds (seen on 25.x)
// silently emit zero bytes. The reliable path is the zstd CLI feeding a pre-decompressed
// --source — a truncated prefix of the dump decodes fine, which also bounds the download:
//   curl -s -r 0-400000000 https://database.lichess.org/lichess_db_eval.jsonl.zst -o eval.zst
//   zstd -d -c eval.zst > eval.jsonl          # "premature end" at the tail is expected
//   node --experimental-strip-types scripts/build-positions.ts --source eval.jsonl --per-bucket 2000 --max-lines 8000000
//
// The dump (https://database.lichess.org) is NDJSON+zstd, ~21 GB compressed. We never
// download it whole: stream → decompress → parse → reservoir-sample each eval bucket →
// stop at --max-lines (or the prefix's end). The reservoir reshuffles every run, so a
// re-run — or a different curl byte-range — refreshes the sampled set.
//
// Three gotchas handled (see lib/positions): dump cp is WHITE-relative (→ side-to-
// move for bucketing), dump FENs may carry only 4 fields (→ pad to 6), and each
// position lists several evals (→ take the deepest). The bucket boundaries come
// from lib/positions so the built file and the runtime loader agree exactly.

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { parseArgs } from 'node:util'
import zlib from 'node:zlib'
import { Chess } from 'chess.js'
import {
  BUCKET_KEYS,
  bucketOf,
  cpToStm,
  normalizeFen,
  sideToMoveOf,
} from '../app/lib/positions.ts'
import type { Bucket, PositionRecord } from '../app/lib/positions.ts'

const DEFAULT_SOURCE = 'https://database.lichess.org/lichess_db_eval.jsonl.zst'

/** One line of the dump: a FEN and several engine evals at increasing depth. */
interface DumpRow {
  fen: string
  evals?: Array<{
    depth?: number
    knodes?: number
    pvs?: Array<{ cp?: number; mate?: number; line?: string }>
  }>
}

function log(msg: string): void {
  // Progress on stderr; stdout is reserved for the final written path.
  process.stderr.write(`${msg}\n`)
}

/** Open the source as a byte stream, decompressing on the fly when it's .zst. */
async function openSource(source: string, signal: AbortSignal): Promise<Readable> {
  let bytes: Readable
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, { signal })
    if (!res.ok || !res.body) throw new Error(`fetch ${source} → ${res.status}`)
    bytes = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  } else {
    bytes = createReadStream(source)
  }
  if (!source.endsWith('.zst')) return bytes

  const make = (zlib as { createZstdDecompress?: () => import('node:stream').Transform })
    .createZstdDecompress
  if (typeof make !== 'function') {
    throw new Error(
      'this Node build has no zlib zstd (need ≥ 22.15 / 23.8). Pre-decompress with ' +
        '`zstd -d lichess_db_eval.jsonl.zst` and pass --source ./lichess_db_eval.jsonl, or upgrade Node.',
    )
  }
  const dec = make()
  bytes.on('error', e => dec.destroy(e))
  return bytes.pipe(dec)
}

/** The deepest eval for a position (depth, then knodes as a tie-break). */
function deepestEval(row: DumpRow): DumpRow['evals'] extends Array<infer E> ? E | undefined : never {
  const evals = row.evals
  if (!evals || evals.length === 0) return undefined as never
  let best = evals[0]!
  for (const e of evals) {
    const d = e.depth ?? 0
    const bd = best.depth ?? 0
    if (d > bd || (d === bd && (e.knodes ?? 0) > (best.knodes ?? 0))) best = e
  }
  return best as never
}

/** A size-`k` reservoir per bucket: a uniform sample of all rows seen in that bucket. */
class Reservoirs {
  private readonly rows = new Map<Bucket, PositionRecord[]>()
  private readonly seen = new Map<Bucket, number>()
  private readonly k: number
  // Plain field assignment, not a constructor parameter property — Node's strip-only
  // TypeScript mode (the runner) can't emit the implicit `this.k = k` a param property needs.
  constructor(k: number) {
    this.k = k
  }

  add(bucket: Bucket, rec: PositionRecord): void {
    let r = this.rows.get(bucket)
    if (!r) this.rows.set(bucket, (r = []))
    const s = (this.seen.get(bucket) ?? 0) + 1
    this.seen.set(bucket, s)
    if (r.length < this.k) r.push(rec)
    else {
      const j = Math.floor(Math.random() * s) // not a workflow script — Math.random is fine
      if (j < this.k) r[j] = rec
    }
  }

  get(bucket: Bucket): PositionRecord[] {
    return this.rows.get(bucket) ?? []
  }

  seenIn(bucket: Bucket): number {
    return this.seen.get(bucket) ?? 0
  }
}

/** A selected row is kept only if it's a legal, non-terminal position with a real choice. */
function playable(rec: PositionRecord): boolean {
  try {
    const g = new Chess(rec.fen)
    return !g.isGameOver() && g.moves().length >= 2
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: DEFAULT_SOURCE },
      'per-bucket': { type: 'string', default: '2000' }, // 5 buckets → ~10k starts
      'max-lines': { type: 'string', default: '2000000' },
      out: { type: 'string', default: 'public/positions/positions.json' },
    },
  })
  const perBucket = Number(values['per-bucket'])
  const maxLines = Number(values['max-lines'])
  const source = values.source!
  const outPath = values.out!

  log(`source: ${source}`)
  log(`per-bucket: ${perBucket} · max-lines: ${maxLines} · out: ${outPath}`)

  const controller = new AbortController()
  const stream = await openSource(source, controller.signal)
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  const reservoirs = new Reservoirs(perBucket)

  let scanned = 0
  let kept = 0
  try {
    for await (const line of rl) {
      if (!line) continue
      if (++scanned % 250_000 === 0) log(`  scanned ${scanned} lines, sampled ${kept}…`)

      let row: DumpRow
      try {
        row = JSON.parse(line) as DumpRow
      } catch {
        continue
      }
      if (!row.fen) continue
      const ev = deepestEval(row)
      const pv = ev?.pvs?.[0]
      if (!pv || typeof pv.cp !== 'number') continue // skip mates and malformed lines

      const fen = normalizeFen(row.fen)
      const sideToMove = sideToMoveOf(fen)
      const cpStm = cpToStm(pv.cp, sideToMove)
      const bucket = bucketOf(cpStm)
      if (!bucket) continue // |cp| > 800: too decisive

      reservoirs.add(bucket, { fen, cpWhite: pv.cp, sideToMove, cpStm })
      kept++

      // Reservoir-sample over the whole scanned prefix (better spread than aborting
      // the instant buckets fill); --max-lines bounds the bandwidth we spend.
      if (scanned >= maxLines) break
    }
  } finally {
    rl.close()
    controller.abort()
    stream.destroy()
  }

  // Validate the selected rows (cheap now — only a few thousand) and report coverage.
  const out: PositionRecord[] = []
  for (const b of BUCKET_KEYS) {
    const rows = reservoirs.get(b).filter(playable)
    out.push(...rows)
    const flag = rows.length < perBucket ? '  ⚠ underfilled' : ''
    log(`  ${b.padEnd(10)} ${rows.length}/${perBucket} kept  (seen ${reservoirs.seenIn(b)})${flag}`)
  }

  // Never overwrite a good set with an empty one: a silent zero (e.g. native zstd
  // emitting nothing) must fail loudly, not clobber positions.json with `[]`.
  if (out.length === 0) {
    throw new Error(
      `sampled 0 positions from ${scanned} lines — source empty or undecodable. ` +
        'If you streamed the .zst URL, use the zstd CLI + --source (see the header).',
    )
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(out)}\n`)
  log(`scanned ${scanned} lines total`)
  process.stdout.write(`${outPath} (${out.length} positions)\n`)
}

main().catch((e: unknown) => {
  log(`build-positions failed: ${(e as Error).message}`)
  process.exitCode = 1
})
