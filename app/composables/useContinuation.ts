import type { Color } from 'chessground/types'
import { parseUciMove } from '~/lib/uci'
import {
  applyMove,
  applyTerminal,
  initRun,
  isRunOver,
  type RunConfig,
  type RunState,
} from '~/lib/scoring'
import { continuationOutcome, type ContinuationOutcome } from '~/lib/continuation'
import type { Analysis } from '~/composables/useEngine'

// The continuation explorer: from a position where a run ENDED (a clean win or a drift
// bust), play it on a few more moves to see whether you'd actually hold it going forward.
// Opened from the run summary; runs on its OWN board (the finished run is untouched) but
// borrows the one Stockfish worker through injected functions.
//
// Unlike the refutation explorer this is a LIVE test, so it shows NO candidate moves or
// arrows — the no-hints rule means you play blind and get a verdict, never a better move.
// Each of your moves is scored loss-vs-best and folded into a fresh drift budget (the run's
// own machinery), so the ending — held / converted / slipped / busted / collapsed / drawn —
// reflects how well YOU played the continuation, not where the position started.

const DEFAULT_STEPS = 4
/** A beat so the engine's reply reads as a move, not an instant teleport. */
const ENGINE_REPLY_DELAY_MS = 300

export type ContinuationPhase = 'engine' | 'player' | 'scoring' | 'done'

export interface ContinuationDeps {
  /** Single best-move search — the engine's reply (and the first move on entry). */
  searchBest: (fen: string) => Promise<Analysis>
  /** Score a played move (loss-vs-best + the opponent's reply), no run/eval side effects. */
  score: (fen: string, playedUci: string) => Promise<{ loss: number; reply: string | null }>
  /** Cancel an in-flight engine search (on exit / restart). */
  stop: () => void
}

export interface ContinuationConfig {
  humanColor: Color
  steps: number
  driftPerMove: number
  blunderCap: number
}

export function useContinuation(deps: ContinuationDeps) {
  const { fen, turnColor, dests, lastMove, check, terminal, winner, move, load } = useChessGame()

  const active = ref(false)
  const phase = ref<ContinuationPhase>('engine')
  const playerMoves = ref(0)
  const maxPlayerMoves = ref(DEFAULT_STEPS)
  const thinking = ref(false)
  const humanColor = ref<Color>('white')
  // The continuation's own drift state + thresholds — kept apart from the finished run.
  const run = ref<RunState>(initRun())
  const config = reactive<RunConfig>({ budget: 1, blunderCap: 8, maxN: DEFAULT_STEPS })

  let rootFen = '' // the run's final position — Restart returns here
  let token = 0 // bumped on enter/restart/exit to invalidate in-flight async

  const drift = computed(() => run.value.drift)
  const budget = computed(() => config.budget)
  // The verdict, once the continuation has ended.
  const outcome = computed<ContinuationOutcome | null>(() =>
    phase.value === 'done' ? continuationOutcome(run.value.status, winner.value, humanColor.value) : null,
  )

  function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function finishVerdict(): void {
    phase.value = 'done'
    thinking.value = false
  }

  /** Apply a long-algebraic move to the continuation board; true if it took. */
  function applyUci(uci: string): boolean {
    const m = parseUciMove(uci)
    if (!m) return false
    return move({ from: m.from, to: m.to, promotion: m.promotion }) !== null
  }

  /** After an engine move lands: end on a terminal board, else hand back to the player. */
  function afterEngineMove(my: number): void {
    if (my !== token) return
    if (terminal.value) {
      run.value = applyTerminal(run.value)
      return finishVerdict()
    }
    phase.value = 'player'
  }

  /**
   * The engine plays its best at the current position. `suggested` (the score search's
   * reply) is applied instantly when present; otherwise — or if it's somehow illegal — a
   * fresh best-move search. The first move on entry has no suggestion, so it searches.
   */
  async function engineMove(my: number, suggested: string | null): Promise<void> {
    phase.value = 'engine'
    if (suggested) {
      await delay(ENGINE_REPLY_DELAY_MS)
      if (my !== token) return
      if (applyUci(suggested)) return afterEngineMove(my)
      // suggested illegal — fall through to a real search
    }
    thinking.value = true
    let best: Analysis
    try {
      best = await deps.searchBest(fen.value)
    } catch {
      if (my === token) finishVerdict()
      return
    } finally {
      if (my === token) thinking.value = false
    }
    if (my !== token) return
    applyUci(best.bestmove)
    afterEngineMove(my)
  }

  /** The player commits a move — a dragged piece (uci = orig+dest, auto-queened). */
  async function play(uci: string): Promise<void> {
    if (!active.value || phase.value !== 'player') return
    const my = token
    const before = fen.value
    if (!applyUci(uci)) return // illegal — chessground snaps it back
    playerMoves.value++
    phase.value = 'scoring'
    thinking.value = true
    let scored: { loss: number; reply: string | null }
    try {
      scored = await deps.score(before, uci)
    } catch {
      if (my === token) finishVerdict()
      return
    } finally {
      if (my === token) thinking.value = false
    }
    if (my !== token) return

    run.value = applyMove(run.value, scored.loss, config)
    // Terminal (you mated/stalemated) wins over a budget/cap ending, same as the run.
    if (terminal.value) {
      run.value = applyTerminal(run.value)
      return finishVerdict()
    }
    // Held the whole way (max-n), or busted (budget/blunder)? Stop with the verdict.
    if (isRunOver(run.value)) return finishVerdict()
    // Survived — the engine answers and it rolls on.
    await engineMove(my, scored.reply)
  }

  /**
   * Open the continuation at a run's final position (the engine is to move — a run ends on
   * your move, before the reply). `cfg` sets the depth and the drift thresholds, scaled from
   * the live settings so the test matches the run's own difficulty.
   */
  async function enter(finalFen: string, cfg: ContinuationConfig): Promise<void> {
    const my = ++token
    rootFen = finalFen
    humanColor.value = cfg.humanColor
    const steps = Math.max(1, Math.round(cfg.steps))
    maxPlayerMoves.value = steps
    config.maxN = steps
    config.blunderCap = cfg.blunderCap
    config.budget = Math.max(1, Math.round(cfg.driftPerMove * steps))
    run.value = initRun()
    playerMoves.value = 0
    active.value = true
    load(finalFen)
    await engineMove(my, null)
  }

  /** Back to the run's final position — play the continuation again from scratch. */
  async function restart(): Promise<void> {
    if (!active.value) return
    const my = ++token
    deps.stop()
    run.value = initRun()
    playerMoves.value = 0
    load(rootFen)
    await engineMove(my, null)
  }

  /** Leave the continuation; the run summary takes the board back. */
  function exit(): void {
    token++
    deps.stop()
    active.value = false
    phase.value = 'engine'
    thinking.value = false
  }

  onScopeDispose(() => {
    token++
  })

  return {
    // board projection (fed to the shared BoardPanel while playing on)
    fen,
    turnColor,
    dests,
    lastMove,
    check,
    // state
    active,
    phase,
    playerMoves,
    maxPlayerMoves,
    thinking,
    drift,
    budget,
    outcome,
    // actions
    enter,
    restart,
    exit,
    play,
  }
}
