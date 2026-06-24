import { parseBestMove, parseInfoLine, type UciInfo } from '~/lib/uci'

// Single-thread Stockfish 18 in a dedicated Web Worker. Single-thread is a
// deliberate choice, not a fallback: multithreaded (Lazy SMP) Stockfish is
// non-deterministic, and our entire scoring signal is tiny win% deltas that
// must replay bit-for-bit. The worker is the raw lite-single build self-hosted
// in public/engine/; it speaks the UCI text protocol (string in, string line
// out) and resolves its own .wasm sibling from its URL, so no locateFile
// override and no COOP/COEP headers are needed.

const ENGINE_URL = '/engine/stockfish-18-lite-single.js'
const HASH_MB = 128
const HANDSHAKE_TIMEOUT_MS = 20_000
const SEARCH_TIMEOUT_MS = 30_000

export interface AnalyzeOptions {
  /** Fixed search work — hardware-independent and reproducible (NOT depth/movetime). */
  nodes: number
  /** Restrict the root search to these long-algebraic moves (UCI `searchmoves`). */
  searchmoves?: string[]
}

export interface Analysis {
  fen: string
  /** Long-algebraic best move, or '(none)' for a terminal position. */
  bestmove: string
  ponder?: string
  /** Centipawns, SIDE-TO-MOVE relative. Undefined when `mate` is set. */
  cp?: number
  /** Mate in N plies, signed, side-to-move relative. Undefined when `cp` is set. */
  mate?: number
  /** Principal variation (long-algebraic). pv[1] = the opponent's reply. */
  pv: string[]
  depth?: number
  nodes?: number
}

/** One ranked line from a MultiPV search (rank 1 = engine's best). */
export interface MultiLine {
  /** PV rank, 1-based (1 = best). */
  multipv: number
  /** The line's first move, long-algebraic (= pv[0]). */
  move: string
  /** Centipawns, side-to-move relative. Undefined when `mate` is set. */
  cp?: number
  /** Mate in N plies, signed, side-to-move relative. Undefined when `cp` is set. */
  mate?: number
  /** Principal variation (long-algebraic) for this line. */
  pv: string[]
  depth?: number
}

interface LineWaiter {
  resolve: () => void
  reject: (e: Error) => void
}

interface ActiveJob {
  fen: string
  /** Multi-line (MultiPV) search? Routes the `bestmove` to the right resolver. */
  multi: boolean
  resolve: (a: Analysis) => void
  resolveMulti: (lines: MultiLine[]) => void
  reject: (e: Error) => void
  /** Latest scored info line per PV rank (key = multipv, 1 in single-PV mode). The
   *  deepest line for each rank wins, since later infos overwrite their key. */
  infos: Map<number, UciInfo>
  timer?: ReturnType<typeof setTimeout>
  settled: boolean
}

export function useEngine() {
  const ready = ref(false)
  const searching = ref(false)
  const error = ref<string | null>(null)

  let worker: Worker | undefined
  let booted: Promise<void> | undefined

  // Exact-line waiters for the handshake (e.g. 'uciok', 'readyok').
  const lineWaiters = new Map<string, LineWaiter>()

  // The single in-flight search. The FIFO `chain` guarantees only one runs at a
  // time, so one accumulator is enough and `bestmove` lines never cross wires.
  let active: ActiveJob | undefined

  // Promise chain = FIFO queue. Every analyze()/newGame() waits its predecessor
  // (success OR failure) before touching the worker.
  let chain: Promise<unknown> = Promise.resolve()

  function post(cmd: string) {
    worker?.postMessage(cmd)
  }

  function settleActiveResolve(bestmove: string, ponder?: string) {
    if (!active || active.settled) return
    const job = active
    job.settled = true
    if (job.timer) clearTimeout(job.timer)
    active = undefined
    searching.value = false
    // Single-PV: the principal line is rank 1 (or the only line the engine reported).
    const info = job.infos.get(1) ?? job.infos.values().next().value
    job.resolve({
      fen: job.fen,
      bestmove,
      ponder,
      cp: info?.cp,
      mate: info?.mate,
      pv: info?.pv ?? (bestmove !== '(none)' ? [bestmove] : []),
      depth: info?.depth,
      nodes: info?.nodes,
    })
  }

  function settleActiveResolveMulti() {
    if (!active || active.settled) return
    const job = active
    job.settled = true
    if (job.timer) clearTimeout(job.timer)
    active = undefined
    searching.value = false
    // One line per PV rank, ordered best-first; drop any rank that never produced a move.
    const lines: MultiLine[] = [...job.infos.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([multipv, info]) => ({
        multipv,
        move: info.pv?.[0] ?? '(none)',
        cp: info.cp,
        mate: info.mate,
        pv: info.pv ?? [],
        depth: info.depth,
      }))
      .filter(l => l.move !== '(none)')
    job.resolveMulti(lines)
  }

  function settleActiveReject(message: string) {
    if (!active || active.settled) return
    const job = active
    job.settled = true
    if (job.timer) clearTimeout(job.timer)
    active = undefined
    searching.value = false
    job.reject(new Error(message))
  }

  function handleLine(line: string) {
    // Handshake waiters first (exact-line match).
    const waiter = lineWaiters.get(line)
    if (waiter) { waiter.resolve(); return }

    if (!active || active.settled) return

    if (line.startsWith('info ')) {
      const info = parseInfoLine(line)
      // Only keep scored search lines; skip 'info string ...' and progress. Key by PV
      // rank (1 when absent) so MultiPV ranks accumulate side by side; a single-PV
      // search just overwrites rank 1 with each deeper line.
      if (info && (info.cp !== undefined || info.mate !== undefined)) {
        active.infos.set(info.multipv ?? 1, info)
      }
      return
    }
    if (line.startsWith('bestmove')) {
      if (active.multi) {
        settleActiveResolveMulti()
      } else {
        const bm = parseBestMove(line)
        settleActiveResolve(bm?.bestmove ?? '(none)', bm?.ponder)
      }
    }
  }

  function waitForLine(token: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        lineWaiters.delete(token)
        reject(new Error(`engine: timed out waiting for "${token}"`))
      }, timeoutMs)
      lineWaiters.set(token, {
        resolve: () => { clearTimeout(timer); lineWaiters.delete(token); resolve() },
        reject: (e) => { clearTimeout(timer); lineWaiters.delete(token); reject(e) },
      })
    })
  }

  function boot(): Promise<void> {
    if (booted) return booted
    booted = (async () => {
      if (typeof Worker === 'undefined') {
        throw new Error('engine: Web Workers unavailable (server context)')
      }
      worker = new Worker(ENGINE_URL)
      worker.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data === 'string') handleLine(ev.data)
      }
      worker.onerror = (ev: ErrorEvent) => {
        const msg = ev.message || 'engine worker error'
        error.value = msg
        // Fail any handshake waiters so boot() rejects promptly (e.g. wasm 404).
        for (const w of lineWaiters.values()) w.reject(new Error(msg))
        lineWaiters.clear()
        settleActiveReject(msg)
      }
      post('uci')
      await waitForLine('uciok', HANDSHAKE_TIMEOUT_MS)
      post(`setoption name Hash value ${HASH_MB}`)
      post('isready')
      await waitForLine('readyok', HANDSHAKE_TIMEOUT_MS)
      ready.value = true
    })()
    return booted
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    // Run regardless of the predecessor's outcome; keep the chain rejection-free.
    const run = chain.then(task, task)
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  /** Boot the worker and complete the UCI handshake. Safe to call repeatedly. */
  async function init(): Promise<void> {
    try {
      await boot()
    } catch (e) {
      error.value = (e as Error).message
      throw e
    }
  }

  /** Search `fen` for a fixed node count. Serialized FIFO behind any prior call. */
  function analyze(fen: string, opts: AnalyzeOptions): Promise<Analysis> {
    return enqueue(async () => {
      await boot()
      return await new Promise<Analysis>((resolve, reject) => {
        const job: ActiveJob = {
          fen, multi: false, resolve, resolveMulti: () => {}, reject, infos: new Map(), settled: false,
        }
        active = job
        searching.value = true
        job.timer = setTimeout(
          () => settleActiveReject(`engine: search timed out after ${SEARCH_TIMEOUT_MS}ms`),
          SEARCH_TIMEOUT_MS,
        )
        post(`position fen ${fen}`)
        const sm = opts.searchmoves?.length ? ` searchmoves ${opts.searchmoves.join(' ')}` : ''
        post(`go nodes ${opts.nodes}${sm}`)
      })
    })
  }

  /**
   * Search `fen` for the top `multipv` lines at a fixed node count — the engine's best
   * try plus the next-best alternatives, each with its own eval and PV. Sets MultiPV for
   * this search and ALWAYS restores it to 1 afterward, so later single-line `analyze()`
   * calls behave normally. Serialized FIFO behind any prior call, like `analyze`.
   */
  function analyzeMulti(fen: string, opts: { nodes: number; multipv: number }): Promise<MultiLine[]> {
    return enqueue(async () => {
      await boot()
      post(`setoption name MultiPV value ${Math.max(1, opts.multipv)}`)
      try {
        return await new Promise<MultiLine[]>((resolve, reject) => {
          const job: ActiveJob = {
            fen, multi: true, resolve: () => {}, resolveMulti: resolve, reject, infos: new Map(), settled: false,
          }
          active = job
          searching.value = true
          job.timer = setTimeout(
            () => settleActiveReject(`engine: search timed out after ${SEARCH_TIMEOUT_MS}ms`),
            SEARCH_TIMEOUT_MS,
          )
          post(`position fen ${fen}`)
          post(`go nodes ${opts.nodes}`)
        })
      } finally {
        // Restore single-PV for every later analyze()/prefetch(); runs on the FIFO chain
        // before the next job, and after a reject (timeout/error) too.
        post('setoption name MultiPV value 1')
      }
    })
  }

  /** Halt the current search early — it emits `bestmove`, so analyze() resolves normally. */
  function stop() {
    if (searching.value) post('stop')
  }

  /** Clear the transposition table between independent positions (clean-state determinism). */
  function newGame(): Promise<void> {
    return enqueue(async () => {
      await boot()
      post('ucinewgame')
      post('isready')
      await waitForLine('readyok', HANDSHAKE_TIMEOUT_MS)
    })
  }

  function dispose() {
    settleActiveReject('engine: disposed')
    for (const w of lineWaiters.values()) w.reject(new Error('engine: disposed'))
    lineWaiters.clear()
    worker?.terminate()
    worker = undefined
    booted = undefined
    ready.value = false
    searching.value = false
  }

  // Tear the worker down with the owning component/effect scope.
  onScopeDispose(dispose)

  return { ready, searching, error, init, analyze, analyzeMulti, stop, newGame, dispose }
}
