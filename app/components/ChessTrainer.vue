<script setup lang="ts">
// The orchestrator: it owns the board (one chess.js via useChessGame) and the
// engine + scoring (useScoring), and sequences the drift-budget loop — prefetch
// the player's position, score the move they play, play the engine's reply, and
// end the run on budget / blunder / max-n / terminal. No mid-run hints: the engine's
// move is never shown, so working out the better move stays the exercise. This is the
// real training screen; board-test and engine-test were throwaway harnesses.
import { parseUciMove } from '~/lib/uci'
import { evalToWinProb } from '~/lib/winprob'
import type { Move } from 'chess.js'
import type { Color, Key } from 'chessground/types'
import type { PositionRecord } from '~/lib/positions'

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
} = useChessGame() // a real start is loaded by startRun once positions resolve

const scoring = useScoring()
const { searching, error, currentWinProb, drift, n, status, config, nodes, over } = scoring

const positions = usePositions()
const { settings } = useSettings()
const { record: recordRun, load: loadHistory } = useHistory()
const { level, streak, busts, record: recordLadder } = useLadder()

const phase = ref<Phase>('booting')
const humanColor = ref<Color>('white')
// The start currently in play — held so "Retry" reloads the exact same position.
const currentPosition = ref<PositionRecord | null>(null)
// The survival target this run is played at (the ladder level at run start).
const playedTarget = ref(level.value)
const runError = ref<string | null>(null)

// Win%-pts a run-ending blunder cost — the only number the run-over screen shows about
// the final move (never the engine's choice). null on a budget / terminal / won ending.
const fatalLoss = ref<number | null>(null)
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

function endRun(): void {
  // Fold a genuine rule-based ending (terminal / budget / blunder / max-n) into the
  // persisted history and the ladder. The backstop error path is skipped — there the
  // run is still 'active' and only an engine failure stopped it, so it neither logs
  // a run nor moves the ladder. Both update synchronously, so the run-over screen
  // already reflects the new ladder level / streak.
  if (currentPosition.value && status.value !== 'active') {
    recordRun({
      n: n.value,
      drift: drift.value,
      status: status.value,
      startFen: currentPosition.value.fen,
      nodes: nodes.value,
      budget: config.budget,
      blunderCap: config.blunderCap,
      maxN: config.maxN,
    })
    recordLadder(status.value, settings.winsToAdvance, settings.lossesToDemote) // win/bust streaks → climb/drop
  }
  phase.value = 'over'
}

/** Snapshot the live settings + the ladder level into the engine + run config for
 *  this run. Applied at run start (not reactively) so a mid-run tweak can't skew an
 *  in-flight comparison, and the survive-target stays fixed for the whole run. */
function applySettings(): void {
  nodes.value = settings.nodes
  config.blunderCap = settings.blunderCap
  // The survive-target is the ladder's current level; the drift budget scales with it
  // (per-move allowance × level, rounded to a whole win%-pt), so each move's tolerance
  // stays constant as you climb instead of long levels becoming impossible.
  playedTarget.value = level.value
  config.maxN = level.value
  config.budget = Math.max(1, Math.round(settings.driftPerMove * level.value))
}

/** Load a position, reset the run, and prefetch the player's first move. */
async function startRun(fen0: string): Promise<void> {
  const myRun = ++runId
  applySettings()
  runError.value = null
  fatalLoss.value = null
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

  try {
    const scored = await scoring.scoreMove(fenBefore, playedUci)
    if (myRun !== runId) return

    winHistory.value.push(evalToWinProb(scored.best))
    scoring.recordMove(scored.loss)

    // Terminal delivered by the player's own move (they mated/stalemated)?
    if (terminal.value) { scoring.recordTerminal(); return endRun() }

    // Run ended on this move (a win, a blunder, or the drift budget spent)? End it
    // WITHOUT revealing the engine's move — figuring out the better move is the whole
    // exercise. Keep only a blunder's magnitude for the summary (a budget bust is
    // cumulative, not one bad move); the board stays visible above it to study.
    if (over.value) {
      fatalLoss.value = status.value === 'blunder' ? scored.loss : null
      return endRun()
    }

    // Survived — no hint, no pause. The engine replies and the loop rolls straight on;
    // the drift gauge and win% bar carry the only feedback.
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

/** Draw a fresh start (bucket-balanced, honouring the eval-range filter) and run it. */
async function nextPosition(): Promise<void> {
  const range = settings.evalRange
  const pos = positions.pick(range ? { range } : undefined)
  if (!pos) {
    runError.value = range
      ? 'No starts match the eval-range filter — widen it in settings.'
      : positions.error.value ?? 'No positions available.'
    phase.value = 'over'
    return
  }
  currentPosition.value = pos
  await startRun(pos.fen)
}

/** Replay the current start from scratch (same position, fresh run). */
async function retryPosition(): Promise<void> {
  if (currentPosition.value) await startRun(currentPosition.value.fen)
  else await nextPosition()
}

onMounted(async () => {
  void loadHistory() // hydrates best-n + recent runs in the background; never blocks play
  try {
    await scoring.init()
    await positions.load() // nextPosition surfaces a load failure as a run error
    await nextPosition()
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
      <p class="kicker">Drift trainer</p>
      <h1 class="tagline">Don't try to win.<br><span class="hl">Try not to lose ground.</span></h1>
    </header>

    <div class="layout">
      <div class="board-col">
        <div class="board-frame">
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
              @move="onMove"
            />
          </div>
        </div>

        <p :class="['status', phase]">
          <span v-if="searching" class="spinner" />
          {{ statusText }}
        </p>

        <!-- Below the board, never over it — the final position stays visible to study
             on every ending (win, blunder, drift, terminal). -->
        <RunSummary
          v-if="phase === 'over'"
          :status="status"
          :n="n"
          :target="playedTarget"
          :level="level"
          :streak="streak"
          :busts="busts"
          :wins-to-advance="settings.winsToAdvance"
          :losses-to-demote="settings.lossesToDemote"
          :drift="drift"
          :budget="config.budget"
          :blunder-cap="config.blunderCap"
          :win-history="winHistory"
          :fatal-loss="fatalLoss"
          :run-error="runError"
          @next="nextPosition"
          @retry="retryPosition"
        />
      </div>

      <aside class="side">
        <ScorePanel
          :win-prob="currentWinProb"
          :drift="drift"
          :budget="config.budget"
          :n="n"
          :target="playedTarget"
          :level="level"
          :streak="streak"
          :busts="busts"
          :wins-to-advance="settings.winsToAdvance"
          :losses-to-demote="settings.lossesToDemote"
          :status="status"
        />
        <SettingsPanel />
        <HistoryPanel />
      </aside>
    </div>
  </main>
</template>

<style scoped>
.trainer {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}
.head {
  margin-bottom: 1.6rem;
}
.kicker {
  margin: 0 0 0.3rem;
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--neon-cyan);
}
.tagline {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(1.9rem, 5vw, 2.8rem);
  line-height: 0.95;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text);
}
.tagline .hl {
  color: var(--neon-cyan);
  text-shadow: 0 0 18px rgba(33, 243, 255, 0.4);
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
.board-frame {
  position: relative;
  padding: 12px;
  --c: 18px;
  clip-path: polygon(
    0 0,
    calc(100% - var(--c)) 0,
    100% var(--c),
    100% 100%,
    var(--c) 100%,
    0 calc(100% - var(--c))
  );
  background: linear-gradient(160deg, var(--surface-2), var(--surface) 60%, var(--bg-sunken));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.board-frame::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  margin: -1.5px;
  clip-path: inherit;
  background: linear-gradient(135deg, var(--neon-cyan), var(--neon-violet), var(--neon-magenta));
}
.board-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  clip-path: inherit;
  background: radial-gradient(var(--neon-cyan) 1px, transparent 1.3px) 0 0 / 8px 8px;
  -webkit-mask-image: linear-gradient(315deg, #000 0%, transparent 28%);
  mask-image: linear-gradient(315deg, #000 0%, transparent 28%);
  opacity: 0.18;
}
.board-stage {
  position: relative;
  z-index: 1;
  width: var(--board-size, min(80vmin, 480px));
  height: var(--board-size, min(80vmin, 480px));
}
.side {
  flex: 1 1 16rem;
  min-width: min(15rem, 100%);
  display: flex;
  flex-direction: column;
  gap: 1.3rem;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  min-height: 1.6rem;
}
.status.player {
  color: var(--neon-cyan);
}
.spinner {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid rgba(33, 243, 255, 0.25);
  border-top-color: var(--neon-cyan);
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@media (max-width: 36rem) {
  .trainer {
    padding: 1.25rem 1rem 3rem;
  }
  .layout {
    gap: 1.4rem;
    justify-content: center;
  }
}
</style>
