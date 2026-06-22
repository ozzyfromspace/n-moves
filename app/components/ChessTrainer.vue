<script setup lang="ts">
// The orchestrator: it owns the board (one chess.js via useChessGame) and the
// engine + scoring (useScoring), and sequences the drift-budget loop — prefetch
// the player's position, score the move they play, flag a slip if they strayed,
// play the engine's reply, and end the run on budget / blunder / max-n /
// terminal. This is the real training screen; board-test and engine-test were
// throwaway harnesses.
import { parseUciMove } from '~/lib/uci'
import type { Move } from 'chess.js'
import type { Color, Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import type { ScoredMove } from '~/composables/useScoring'

// Placeholder starts until usePositions (Task #6) loads the curated, eval-bucketed
// set. All legal, all roughly equal — fine for shaking out the loop (deliberate
// blunders generate the drift); the real eval spectrum arrives with the dataset.
const SAMPLE_FENS = [
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', // Italian, white to move
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', // Ruy Lopez, black to move
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', // Sicilian, black to move
]

type Phase = 'booting' | 'player' | 'scoring' | 'opponent' | 'over'

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

// Slip feedback — the lightweight v0 cue (best-move arrow + one line). The frozen
// dismissable overlay is Task #5.
const slip = ref<{ played: string; best: string; loss: number } | null>(null)
const arrow = ref<DrawShape[]>([])

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

const runOverText = computed(() => {
  if (runError.value) return `Run stopped — ${runError.value}`
  switch (status.value) {
    case 'blunder': return `Blunder — one move cost ≥ ${config.blunderCap}% win probability.`
    case 'budget': return `Drift budget spent — you slipped ≥ ${config.budget}% in total.`
    case 'max-n': return `Run held! You matched the engine for ${config.maxN} plies. 🎉`
    case 'terminal': return 'The game reached a terminal position.'
    default: return 'Run over.'
  }
})

const statusText = computed(() => {
  switch (phase.value) {
    case 'booting': return error.value ? `Engine error: ${error.value}` : 'Booting engine…'
    case 'player': return 'Your move — play like the computer.'
    case 'scoring': return 'Scoring your move…'
    case 'opponent': return 'Engine replies…'
    case 'over': return runOverText.value
  }
  return ''
})

/** Long-algebraic 'e2e4' → 'e2→e4' (with '=Q' on a promotion) for display. */
function uciPretty(uci: string): string {
  const m = parseUciMove(uci)
  if (!m) return uci
  return `${m.from}→${m.to}${m.promotion ? `=${m.promotion.toUpperCase()}` : ''}`
}

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

    applySlip(scored, playedUci)
    scoring.recordMove(scored.loss)

    // Terminal delivered by the player's own move (they mated/stalemated)?
    if (terminal.value) { scoring.recordTerminal(); return endRun() }
    // Ended by drift budget / blunder cap / max-n?
    if (over.value) return endRun()

    await playOpponent(scored.reply, myRun)
  } catch (e) {
    if (myRun !== runId) return
    runError.value = (e as Error).message
    phase.value = 'over'
  }
}

async function playOpponent(replyUci: string | null, myRun: number): Promise<void> {
  phase.value = 'opponent'
  await delay(OPPONENT_DELAY_MS)
  if (myRun !== runId) return

  if (replyUci) {
    const m = parseUciMove(replyUci)
    if (m) move({ from: m.from, to: m.to, promotion: m.promotion })
  }

  // Terminal from the opponent's reply?
  if (terminal.value) { scoring.recordTerminal(); return endRun() }

  phase.value = 'player'
  scoring.prefetch(fen.value).catch(() => {}) // prefetch the new position
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

        <p :class="['status', phase]">
          <span v-if="searching" class="spinner" />
          {{ statusText }}
        </p>

        <p v-if="slip" class="slip">
          You played <b>{{ uciPretty(slip.played) }}</b>
          (<span class="loss">−{{ slip.loss.toFixed(1) }}%</span>) ·
          engine wanted <b class="best">{{ uciPretty(slip.best) }}</b>
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

        <div v-if="phase === 'over'" class="controls">
          <button class="primary" @click="nextPosition">Next position →</button>
          <button @click="retryPosition">Retry this one</button>
        </div>
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
.slip {
  margin: 0.6rem 0 0;
  font-size: 0.9rem;
  color: #444;
}
.slip .loss {
  color: #dc2626;
  font-variant-numeric: tabular-nums;
}
.slip .best {
  color: #166534;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.controls button {
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  background: #fff;
  cursor: pointer;
}
.controls button:hover {
  border-color: #888;
}
.controls button.primary {
  background: #1a1a1a;
  color: #fff;
  border-color: #1a1a1a;
}
.controls button.primary:hover {
  background: #000;
}
</style>
