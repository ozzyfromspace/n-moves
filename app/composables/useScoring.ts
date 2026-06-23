import { evalToWinProb, type EvalScore } from '~/lib/winprob'
import {
  DEFAULT_RUN_CONFIG,
  applyMove,
  applyTerminal,
  initRun,
  isRunOver,
  moveLoss,
  type RunConfig,
  type RunState,
} from '~/lib/scoring'
import { useEngine, type Analysis } from '~/composables/useEngine'

// The reactive heart of the drift-budget loop. It owns one Stockfish worker and
// the run state machine, turning a played move into a win%-loss and folding it
// into cumulative drift. It is deliberately board-agnostic: ChessTrainer.vue
// drives chess.js and sequences the loop (prefetch → user move → score →
// opponent reply); this composable only answers "how much did that move cost,
// and what's the opponent's reply?" and tracks when the run ends. The pure math
// lives in lib/scoring + lib/winprob (vitest-covered); here we add reactivity,
// the engine, and the ≤2-searches-per-ply prefetch protocol.

/** The verdict on one played move, returned by `scoreMove`. */
export interface ScoredMove {
  /** Win% lost vs the engine's best (≥ 0; exactly 0 when the player matched it). */
  loss: number
  /** Engine's best eval at P (E_best), side-to-move = player. */
  best: EvalScore
  /** Eval after the player's actual move (E_played), same side and horizon. */
  played: EvalScore
  /** Engine's best move B in long-algebraic. */
  bestMove: string
  /** True when the player's move WAS B — no second search ran, loss is 0. */
  matchedBest: boolean
  /**
   * Opponent reply (long-algebraic): pv[1] of the applied search, or the engine's
   * `ponder` move when the PV is truncated — a single-move `searchmoves` search
   * reports only the root move (pv length 1), so pv[1] is undefined but `ponder`
   * still carries the predicted reply. null if neither is available.
   */
  reply: string | null
}

/** Engine Analysis → the cp-XOR-mate shape the win% math consumes. */
function toEval(a: Analysis): EvalScore {
  return { cp: a.cp, mate: a.mate }
}

export function useScoring() {
  const engine = useEngine()

  // Tunables (editable from settings). NODES is the fixed, hardware-independent search
  // work; the run-end thresholds (budget / blunder cap / maxN) all live in `config`.
  const nodes = ref(800_000)
  const config = reactive<RunConfig>({ ...DEFAULT_RUN_CONFIG })

  // The pure run state machine, made reactive.
  const run = ref<RunState>(initRun())
  const n = computed(() => run.value.n)
  const drift = computed(() => run.value.drift)
  const status = computed(() => run.value.status)
  const over = computed(() => isRunOver(run.value))

  // The player's standing at the position they currently face: E_best of the most
  // recent completed prefetch (always player-perspective). Drives the win% bar.
  const currentEval = ref<EvalScore | null>(null)
  const currentWinProb = computed(() =>
    currentEval.value ? evalToWinProb(currentEval.value) : 50,
  )

  // The in-flight (or completed) best-move search for the position the player is
  // about to move in. Kicked off early by `prefetch` so the wait hides behind the
  // human's thinking time; `scoreMove` awaits it.
  let pending: { fen: string; promise: Promise<Analysis> } | undefined

  /**
   * Kick off the deterministic best-move search for `fen` (player to move).
   * Idempotent per fen — calling again with the same fen reuses the in-flight
   * promise. Fire-and-forget from the trainer; `scoreMove` awaits the result.
   */
  function prefetch(fen: string): Promise<Analysis> {
    if (pending && pending.fen === fen) return pending.promise
    const promise = engine.analyze(fen, { nodes: nodes.value }).then((a) => {
      // Adopt this eval only if it's still the position we're waiting on — a newer
      // prefetch or a reset may have superseded it.
      if (pending?.fen === fen) currentEval.value = toEval(a)
      return a
    })
    pending = { fen, promise }
    // Mark the fire-and-forget rejection observed; scoreMove's await still sees it.
    promise.catch(() => {})
    return promise
  }

  /**
   * Score the player's move `playedUci` made from position `fen`. Awaits the
   * prefetch of `fen` for E_best + B; if the player matched B, loss is 0 and no
   * second search runs (the reply comes from the best PV). Otherwise one
   * `searchmoves` search yields E_played (same horizon, same side) and the reply.
   * Pure scoring — does NOT mutate run state (call `recordMove` for that).
   */
  async function scoreMove(fen: string, playedUci: string): Promise<ScoredMove> {
    const bestAnalysis = await prefetch(fen)
    const best = toEval(bestAnalysis)
    const bestMove = bestAnalysis.bestmove

    if (playedUci === bestMove) {
      return {
        loss: 0,
        best,
        played: best,
        bestMove,
        matchedBest: true,
        reply: bestAnalysis.pv[1] ?? bestAnalysis.ponder ?? null,
      }
    }

    const playedAnalysis = await engine.analyze(fen, {
      nodes: nodes.value,
      searchmoves: [playedUci],
    })
    const played = toEval(playedAnalysis)
    return {
      loss: moveLoss(best, played),
      best,
      played,
      bestMove,
      matchedBest: false,
      reply: playedAnalysis.pv[1] ?? playedAnalysis.ponder ?? null,
    }
  }

  /**
   * A one-off best-move search of `fen`, with no run-state or live-eval side
   * effects. Used as the opponent-reply fallback when the scoring search's PV is
   * truncated and no ponder move is available (should be rare).
   */
  function searchBest(fen: string): Promise<Analysis> {
    return engine.analyze(fen, { nodes: nodes.value })
  }

  /** Fold a scored move's loss into the run; returns the new run state. */
  function recordMove(loss: number): RunState {
    run.value = applyMove(run.value, loss, config)
    return run.value
  }

  /** Mark the run ended by a terminal board position (mate/stalemate/draw). */
  function recordTerminal(): RunState {
    run.value = applyTerminal(run.value)
    return run.value
  }

  /**
   * Start a fresh run on a new position: clear run state and the live eval, and
   * clear the engine's transposition table so the first search is from a clean,
   * reproducible state. Any in-flight search is stopped so this resolves promptly.
   */
  async function reset(): Promise<void> {
    engine.stop()
    pending = undefined
    currentEval.value = null
    run.value = initRun()
    await engine.newGame()
  }

  return {
    // engine lifecycle (passthrough)
    ready: engine.ready,
    searching: engine.searching,
    error: engine.error,
    init: engine.init,
    stop: engine.stop,
    // tunables
    nodes,
    config,
    // run state
    run,
    n,
    drift,
    status,
    over,
    currentEval,
    currentWinProb,
    // actions
    reset,
    prefetch,
    scoreMove,
    searchBest,
    recordMove,
    recordTerminal,
  }
}
