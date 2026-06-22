<script setup lang="ts">
// The orchestrator: it owns the board (one chess.js via useChessGame) and the
// engine + scoring (useScoring), and sequences the drift-budget loop — prefetch
// the player's position, score the move they play, flag a slip if they strayed,
// play the engine's reply, and end the run on budget / blunder / max-n /
// terminal. This is the real training screen; board-test and engine-test were
// throwaway harnesses.
import { parseUciMove } from '~/lib/uci'
import { evalToWinProb } from '~/lib/winprob'
import type { Move } from 'chess.js'
import type { Color, Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import type { ScoredMove } from '~/composables/useScoring'

// Placeholder starts until usePositions (Task #6) loads the curated, eval-bucketed
// set. All legal, all roughly equal — fine for shaking out the loop (deliberate
// blunders generate the drift); the real eval spectrum arrives with the dataset.
const SAMPLE_FENS = [
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', // Giuoco Piano, white to move
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', // Ruy Lopez, black to move
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', // Sicilian, black to move
]

type Phase = 'booting' | 'player' | 'scoring' | 'slip' | 'opponent' | 'over'

const OPPONENT_DELAY_MS = 300

const {
  fen,
  turnColor,
  dests,
  lastMove,
  check,
  isGameOver,
  terminal,
  move,
  load,
} = useChessGame(SAMPLE_FENS[0])

const scoring = useScoring()
const { searching, error, currentWinProb, drift, n, status, config, slipThreshold, over } = scoring

const phase = ref<Phase>('booting')
const humanColor = ref<Color>('white')
const fenIndex = ref(0)
const sessionBestN = ref(0)
const runError = ref<string | null>(null)

// The current slip (player strayed ≥ slipThreshold): drives the green best-move
// arrow, the freeze-on-slip SlipOverlay, and — if it ended the run — RunSummary's
// "final move" line. null when the last move matched or stayed under threshold.
const slip = ref<{ played: string; best: string; loss: number } | null>(null)
const arrow = ref<DrawShape[]>([])

// The engine reply held while a slip overlay is up; played once the user continues.
const pendingReply = ref<string | null>(null)
// Player-perspective win% at each ply faced — the RunSummary sparkline series.
const winHistory = ref<number[]>([])

// Invalidates in-flight async continuations when the position changes underfoot
// (e.g. the user hits "Next position" mid-search or mid-reply).
let runId = 0

const orientation = computed<Color>(() => humanColor.value)
const movableColor = computed<Color | undefined>(() =>
  phase.value === 'player' && turnColor.value === humanColor.value && !isGameOver.value
    ? humanColor.value
    : undefined,
)
const locked = computed(() => phase.value !== 'player')

const statusText = computed(() => {
  switch (phase.value) {
    case 'booting': return error.value ? `Engine error: ${error.value}` : 'Booting engine…'
    case 'player': return 'Your move — play like the computer.'
    case 'scoring': return 'Scoring your move…'
    case 'slip': return 'Study the better move, then continue.'
    case 'opponent': return 'Engine replies…'
    case 'over': return '' // RunSummary owns the run-over messaging
  }
  return ''
})

/** chess.js Move → the long-algebraic string the engine speaks ('e7e8q'). */
function moveToUci(m: Move): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Show the engine's best move as a green arrow + one line when the player slipped. */
function applySlip(s: ScoredMove, playedUci: string): void {
  if (!s.matchedBest && s.loss >= slipThreshold.value) {
    const b = parseUciMove(s.bestMove)
    slip.value = { played: playedUci, best: s.bestMove, loss: s.loss }
    arrow.value = b ? [{ orig: b.from as Key, dest: b.to as Key, brush: 'green' }] : []
  } else {
    slip.value = null
    arrow.value = []
  }
}

function endRun(): void {
  phase.value = 'over'
  if (n.value > sessionBestN.value) sessionBestN.value = n.value
}

/** Load a position, reset the run, and prefetch the player's first move. */
async function startRun(fen0: string): Promise<void> {
  const myRun = ++runId
  runError.value = null
  slip.value = null
  arrow.value = []
  pendingReply.value = null
  winHistory.value = []
  load(fen0)
  humanColor.value = turnColor.value // the side to move is the human
  phase.value = 'scoring' // brief: reset clears the TT, then we prefetch
  try {
    await scoring.reset()
    if (myRun !== runId) return
    phase.value = 'player'
    scoring.prefetch(fen.value).catch(() => {}) // hide the search behind think time
  } catch (e) {
    if (myRun !== runId) return
    runError.value = (e as Error).message
    phase.value = 'over'
  }
}

async function onMove(payload: { orig: Key; dest: Key }): Promise<void> {
  if (phase.value !== 'player') return
  const myRun = runId
  const fenBefore = fen.value
  const played = move({ from: payload.orig, to: payload.dest })
  if (!played) return // illegal — chessground snaps the piece back

  const playedUci = moveToUci(played)
  phase.value = 'scoring'
  slip.value = null
  arrow.value = []

  try {
    const scored = await scoring.scoreMove(fenBefore, playedUci)
    if (myRun !== runId) return

    winHistory.value.push(evalToWinProb(scored.best))
    applySlip(scored, playedUci)
    scoring.recordMove(scored.loss)

    // Terminal delivered by the player's own move (they mated/stalemated)?
    if (terminal.value) { scoring.recordTerminal(); return endRun() }
    // Ended by drift budget / blunder cap / max-n?
    if (over.value) return endRun()

    // A displayed slip pauses the loop: freeze the board with the engine's move
    // arrowed and wait for the player to study it (continueFromSlip resumes).
    if (slip.value) {
      pendingReply.value = scored.reply
      phase.value = 'slip'
      return
    }

    await playOpponent(scored.reply, myRun)
  } catch (e) {
    if (myRun !== runId) return
    runError.value = (e as Error).message
    phase.value = 'over'
  }
}

/** Apply a long-algebraic reply to the board; true if it was legal and applied. */
function applyReply(uci: string | null): boolean {
  if (!uci || uci === '(none)') return false
  const m = parseUciMove(uci)
  if (!m) return false
  return move({ from: m.from, to: m.to, promotion: m.promotion }) !== null
}

async function playOpponent(suggestedReply: string | null, myRun: number): Promise<void> {
  phase.value = 'opponent'
  await delay(OPPONENT_DELAY_MS)
  if (myRun !== runId) return

  // Apply the opponent's reply. The suggested move (pv[1]/ponder from the scoring
  // search) is free; if it's missing or somehow illegal, fall back to a dedicated
  // best-move search so a truncated PV can never hang the game.
  if (!applyReply(suggestedReply) && !isGameOver.value) {
    const best = await scoring.searchBest(fen.value)
    if (myRun !== runId) return
    applyReply(best.bestmove)
  }

  // Terminal from the opponent's reply?
  if (terminal.value) { scoring.recordTerminal(); return endRun() }

  // Backstop: control must return to the human now. If somehow it can't, end the
  // run rather than leave an inert board (the exact symptom this fix targets).
  if (turnColor.value !== humanColor.value) {
    runError.value = 'could not apply the engine reply'
    return endRun()
  }

  phase.value = 'player'
  scoring.prefetch(fen.value).catch(() => {}) // prefetch the new position
}

/** Resume the loop after the player dismisses the slip overlay. */
async function continueFromSlip(): Promise<void> {
  if (phase.value !== 'slip') return
  const myRun = runId
  const reply = pendingReply.value
  pendingReply.value = null
  slip.value = null
  arrow.value = []
  try {
    await playOpponent(reply, myRun)
  } catch (e) {
    if (myRun !== runId) return
    runError.value = (e as Error).message
    phase.value = 'over'
  }
}

async function nextPosition(): Promise<void> {
  fenIndex.value = (fenIndex.value + 1) % SAMPLE_FENS.length
  await startRun(SAMPLE_FENS[fenIndex.value]!)
}

async function retryPosition(): Promise<void> {
  await startRun(SAMPLE_FENS[fenIndex.value]!)
}

onMounted(async () => {
  try {
    await scoring.init()
    await startRun(SAMPLE_FENS[fenIndex.value]!)
  } catch (e) {
    runError.value = (e as Error).message
    phase.value = 'over'
  }
})

// Invalidate any pending continuation if the component goes away mid-loop.
onBeforeUnmount(() => { runId++ })
</script>

<template>
  <main class="trainer">
    <header class="head">
      <h1>n-moves</h1>
      <p class="tagline">Don't try to win — try not to lose ground.</p>
    </header>

    <div class="layout">
      <div class="board-col">
        <div class="board-stage">
          <BoardPanel
            :fen="fen"
            :orientation="orientation"
            :turn-color="turnColor"
            :dests="dests"
            :movable-color="movableColor"
            :last-move="lastMove"
            :check="check"
            :view-only="locked"
            :auto-shapes="arrow"
            @move="onMove"
          />

          <SlipOverlay
            v-if="phase === 'slip' && slip"
            :played="slip.played"
            :best="slip.best"
            :loss="slip.loss"
            @continue="continueFromSlip"
          />

          <RunSummary
            v-if="phase === 'over'"
            :status="status"
            :n="n"
            :best-n="sessionBestN"
            :drift="drift"
            :budget="config.budget"
            :blunder-cap="config.blunderCap"
            :win-history="winHistory"
            :fatal-slip="slip"
            :run-error="runError"
            @next="nextPosition"
            @retry="retryPosition"
          />
        </div>

        <p :class="['status', phase]">
          <span v-if="searching" class="spinner" />
          {{ statusText }}
        </p>
      </div>

      <aside class="side">
        <ScorePanel
          :win-prob="currentWinProb"
          :drift="drift"
          :budget="config.budget"
          :n="n"
          :best-n="sessionBestN"
          :status="status"
        />
      </aside>
    </div>
  </main>
</template>

<style scoped>
.trainer {
  max-width: 60rem;
  margin: 2rem auto;
  padding: 0 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
.head {
  margin-bottom: 1.25rem;
}
h1 {
  font-size: 1.75rem;
  margin: 0;
  letter-spacing: -0.02em;
}
.tagline {
  margin: 0.15rem 0 0;
  color: #666;
}
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  align-items: flex-start;
}
.board-col {
  flex: 0 0 auto;
}
.board-stage {
  position: relative;
  width: var(--board-size, min(80vmin, 480px));
  height: var(--board-size, min(80vmin, 480px));
}
.side {
  flex: 1 1 16rem;
  min-width: 15rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.85rem 0 0;
  font-size: 0.95rem;
  font-weight: 600;
  min-height: 1.4rem;
}
.status.over {
  color: #374151;
}
.spinner {
  width: 0.7rem;
  height: 0.7rem;
  border: 2px solid #c7d2fe;
  border-top-color: #2563eb;
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
