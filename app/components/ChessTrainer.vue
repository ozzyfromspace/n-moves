<script setup lang="ts">
// The orchestrator: it owns the board (one chess.js via useChessGame) and the
// engine + scoring (useScoring), and sequences the drift-budget loop — prefetch
// the player's position, score the move they play, play the engine's reply, and
// end the run on budget / blunder / max-n / terminal. No mid-run hints: the engine's
// move is never shown, so working out the better move stays the exercise. This is the
// real training screen; board-test and engine-test were throwaway harnesses.
import { parseUciMove } from '~/lib/uci'
import { evalToWinProb } from '~/lib/winprob'
import { buildTimeline } from '~/lib/timeline'
import { ACTIVE_RUN_VERSION, type ActiveRun } from '~/lib/activeRun'
import type { Move } from 'chess.js'
import type { Color, Dests, Key } from 'chessground/types'
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
// Destructured for the template (top-level refs auto-unwrap there): the trainer
// shows a notice when only the sample set loaded, so a thin deploy is visible.
const { usingSample: onSampleSet, count: positionCount } = positions
const { settings } = useSettings()
const { record: recordRun, load: loadHistory } = useHistory()
const { level, streak, busts, record: recordLadder } = useLadder()
const activeRun = useActiveRun()

const phase = ref<Phase>('booting')
const humanColor = ref<Color>('white')
// The start currently in play — held so "Retry" reloads the exact same position.
const currentPosition = ref<PositionRecord | null>(null)
// The survival target this run is played at (the ladder level at run start).
const playedTarget = ref(level.value)
// True once the current position has been won and banked. Persisted, preserved across
// "Restart", cleared by "Next" or the settings "Drop banked" button — while set, a
// replay of this position counts toward neither the ladder nor history, so
// experimenting on a position you've already cleared can't demote you.
const positionBanked = ref(false)
// Whether THIS run *started* on an already-banked position — captured at run start so a
// later Drop can't relabel a finished run. Drives the "Banked ✓" summary and the
// no-count decision (a banked replay is free practice; a first win still counts).
const bankedAtStart = ref(false)
const runError = ref<string | null>(null)

// Win%-pts a run-ending blunder cost — the only number the run-over screen shows about
// the final move (never the engine's choice). null on a budget / terminal / won ending.
const fatalLoss = ref<number | null>(null)
// Player-perspective win% at each ply faced — the RunSummary sparkline series.
const winHistory = ref<number[]>([])
// Every ply played this run (human + engine, interleaved), long-algebraic UCI. The
// single backbone: it rebuilds the board on a refresh-resume and feeds the scrubber.
const moves = ref<string[]>([])
// Which past frame the scrubber shows: null = the live tip; a number = that frame
// index (0 = the start). The live game (useChessGame) is never touched — only the view.
const viewPly = ref<number | null>(null)

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

// The scrubber timeline: one board snapshot per ply, rebuilt from the start + moves.
const tip = computed(() => moves.value.length) // the live frame index
const timeline = computed(() =>
  currentPosition.value ? buildTimeline(currentPosition.value.fen, moves.value) : [],
)
const atLive = computed(() => viewPly.value === null)
const viewIndex = computed(() => viewPly.value ?? tip.value)

// What BoardPanel renders. At the live tip it's the real game (legal dests, input when
// it's your move); scrubbed into the past it's a read-only timeline snapshot — no dests,
// no input — so you can look back without disturbing play. Orientation stays the
// player's side throughout (handled separately, never flips on a scrub).
const view = computed(() => {
  if (viewPly.value === null) {
    return {
      fen: fen.value,
      turnColor: turnColor.value,
      dests: dests.value as Dests | undefined,
      movableColor: movableColor.value,
      lastMove: lastMove.value,
      check: check.value,
      viewOnly: locked.value,
    }
  }
  const frame = timeline.value[viewPly.value] ?? timeline.value[timeline.value.length - 1]
  return {
    fen: frame?.fen ?? fen.value,
    turnColor: (frame?.turnColor ?? turnColor.value) as Color,
    dests: undefined as Dests | undefined,
    movableColor: undefined as Color | undefined,
    lastMove: frame?.lastMove as [Key, Key] | undefined,
    check: frame?.check ?? false,
    viewOnly: true,
  }
})

/** Step the scrubber by `delta` plies, clamping; stepping onto the tip returns to live. */
function scrubBy(delta: number): void {
  if (tip.value === 0) return // nothing to scrub yet
  const next = Math.max(0, Math.min(tip.value, viewIndex.value + delta))
  viewPly.value = next >= tip.value ? null : next
}

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

/** Build the persistable snapshot of the current run, or null when no run is loaded. */
function snapshot(savePhase: 'player' | 'over'): ActiveRun | null {
  if (!currentPosition.value) return null
  const live = scoring.currentEval.value
  return {
    version: ACTIVE_RUN_VERSION,
    position: { ...currentPosition.value },
    humanColor: humanColor.value,
    moves: [...moves.value],
    run: { n: n.value, drift: drift.value, status: status.value },
    winHistory: [...winHistory.value],
    fatalLoss: fatalLoss.value,
    playedTarget: playedTarget.value,
    banked: positionBanked.value,
    bankedAtStart: bankedAtStart.value,
    nodes: nodes.value,
    config: { budget: config.budget, blunderCap: config.blunderCap, maxN: config.maxN },
    currentEval: live ? { ...live } : null,
    phase: savePhase,
    runError: runError.value,
  }
}

/** Persist the run at a stable point: run start, a completed ply, or a rule ending. */
function persist(savePhase: 'player' | 'over'): void {
  const snap = snapshot(savePhase)
  if (snap) void activeRun.save(snap)
}

function endRun(): void {
  // Fold a genuine rule-based ending (terminal / budget / blunder / max-n) into the
  // persisted history and the ladder, and snapshot it as 'over' so a refresh restores
  // the result. The backstop error path is skipped — there the run is still 'active'
  // and only an engine failure stopped it, so it neither logs a run nor moves the
  // ladder nor persists; a refresh then resumes the last clean 'player' snapshot and
  // re-searches, recovering from the transient failure. Both update synchronously, so
  // the run-over screen already reflects the new ladder level / streak.
  if (currentPosition.value && status.value !== 'active') {
    // A run that STARTED banked is a replay of a position you've already won: it counts
    // toward neither the ladder nor history, so experimenting can't demote you. A first
    // win (started un-banked) still counts and then banks the position for next time.
    if (!bankedAtStart.value) {
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
      if (status.value === 'max-n') positionBanked.value = true // a win banks this position
    }
    persist('over') // resume the summary on refresh (banked replays too); never re-records
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
  // Is this a replay of an already-banked position? Captured now (Next cleared the flag
  // for a fresh deal; Restart preserved it) so a mid-run Drop can't relabel this run.
  bankedAtStart.value = positionBanked.value
  runError.value = null
  fatalLoss.value = null
  winHistory.value = []
  moves.value = []
  viewPly.value = null // a fresh run starts at the live tip, never mid-scrub
  load(fen0)
  humanColor.value = turnColor.value // the side to move is the human
  phase.value = 'scoring' // brief: reset clears the TT, then we prefetch
  try {
    await scoring.reset()
    if (myRun !== runId) return
    phase.value = 'player'
    persist('player') // snapshot the fresh run so even a 0-move refresh resumes it
    scoring.prefetch(fen.value).catch(() => {}) // hide the search behind think time
  } catch (e) {
    if (myRun !== runId) return
    runError.value = (e as Error).message
    phase.value = 'over'
  }
}

async function onMove(payload: { orig: Key; dest: Key }): Promise<void> {
  // Only the live tip on the player's turn accepts input (the past is view-only), but
  // guard anyway so a scrubbed view can never inject a move into the live game.
  if (phase.value !== 'player' || viewPly.value !== null) return
  const myRun = runId
  const fenBefore = fen.value
  const played = move({ from: payload.orig, to: payload.dest })
  if (!played) return // illegal — chessground snaps the piece back

  const playedUci = moveToUci(played)
  moves.value.push(playedUci) // record the human's ply for the scrubber + resume
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

/** Apply a long-algebraic reply to the board; the applied move's UCI, or null if illegal. */
function applyReply(uci: string | null): string | null {
  if (!uci || uci === '(none)') return null
  const m = parseUciMove(uci)
  if (!m) return null
  const applied = move({ from: m.from, to: m.to, promotion: m.promotion })
  return applied ? moveToUci(applied) : null
}

async function playOpponent(suggestedReply: string | null, myRun: number): Promise<void> {
  phase.value = 'opponent'
  await delay(OPPONENT_DELAY_MS)
  if (myRun !== runId) return

  // Apply the opponent's reply. The suggested move (pv[1]/ponder from the scoring
  // search) is free; if it's missing or somehow illegal, fall back to a dedicated
  // best-move search so a truncated PV can never hang the game.
  let replyUci = applyReply(suggestedReply)
  if (!replyUci && !isGameOver.value) {
    const best = await scoring.searchBest(fen.value)
    if (myRun !== runId) return
    replyUci = applyReply(best.bestmove)
  }
  if (replyUci) moves.value.push(replyUci) // record the engine's ply for the scrubber + resume

  // Terminal from the opponent's reply?
  if (terminal.value) { scoring.recordTerminal(); return endRun() }

  // Backstop: control must return to the human now. If somehow it can't, end the
  // run rather than leave an inert board (the exact symptom this fix targets).
  if (turnColor.value !== humanColor.value) {
    runError.value = 'could not apply the engine reply'
    return endRun()
  }

  phase.value = 'player'
  persist('player') // a completed ply — snapshot so a refresh resumes here exactly
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
  positionBanked.value = false // a fresh deal is ladder-eligible again (Restart keeps the bank)
  currentPosition.value = pos
  await startRun(pos.fen)
}

/** Replay the current start from scratch (same position, fresh run). */
async function retryPosition(): Promise<void> {
  if (currentPosition.value) await startRun(currentPosition.value.fen)
  else await nextPosition()
}

/**
 * Drop the current position's banked status (from the settings panel), so the next
 * attempt on it counts toward the ladder again. The in-progress/finished run keeps its
 * label (bankedAtStart was fixed at run start); only a subsequent Restart is re-armed.
 * Persists the cleared flag at a resting point so the drop survives a refresh.
 */
function dropBanked(): void {
  if (!positionBanked.value) return
  positionBanked.value = false
  if (!currentPosition.value) return
  if (status.value !== 'active') persist('over')
  else if (phase.value === 'player') persist('player')
  // mid-search: the next stable save (completed ply / run end) persists the cleared flag
}

/**
 * Resume a persisted run exactly: rebuild the board by replaying every recorded ply,
 * re-seat the scoring state machine + engine config, and restore the win% history and
 * view. Deliberately does NOT touch history or the ladder — an 'over' snapshot was
 * already counted when it first ended (pre-refresh), and a 'player' snapshot is still
 * in progress; restore must never double-count either.
 */
function restoreRun(s: ActiveRun): void {
  runId++ // invalidate anything in flight (paranoia; nothing runs before mount)
  currentPosition.value = s.position
  humanColor.value = s.humanColor
  playedTarget.value = s.playedTarget
  positionBanked.value = s.banked
  bankedAtStart.value = s.bankedAtStart
  winHistory.value = [...s.winHistory]
  fatalLoss.value = s.fatalLoss
  runError.value = s.runError
  moves.value = [...s.moves]
  viewPly.value = null

  scoring.restore({ run: s.run, nodes: s.nodes, config: s.config, currentEval: s.currentEval })

  // Rebuild the board: load the start, then replay each ply through the one chess.js.
  load(s.position.fen)
  for (const uci of s.moves) {
    const m = parseUciMove(uci)
    if (m) move({ from: m.from, to: m.to, promotion: m.promotion })
  }

  if (s.phase === 'over') {
    phase.value = 'over'
    return
  }
  phase.value = 'player'
  scoring.prefetch(fen.value).catch(() => {}) // re-prime the search for the resumed position
}

/** ←/→ scrub the run's moves — unless a form field is focused or a modifier is held. */
function onKey(e: KeyboardEvent): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  if (tip.value === 0) return // nothing to scrub
  const el = document.activeElement as HTMLElement | null
  if (
    el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  ) {
    return // let arrow keys edit the focused field (e.g. settings inputs)
  }
  e.preventDefault()
  scrubBy(e.key === 'ArrowLeft' ? -1 : 1)
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  void loadHistory() // hydrates best-n + recent runs in the background; never blocks play
  try {
    await scoring.init()
    await positions.load() // nextPosition surfaces a load failure as a run error
    // Resume a run interrupted by a refresh; otherwise deal a fresh start.
    const saved = await activeRun.loadSaved()
    if (saved) restoreRun(saved)
    else await nextPosition()
  } catch (e) {
    runError.value = (e as Error).message
    phase.value = 'over'
  }
})

// Invalidate any pending continuation if the component goes away mid-loop.
onBeforeUnmount(() => {
  runId++
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <main class="trainer">
    <header class="head">
      <p class="kicker">Drift trainer</p>
      <h1 class="tagline">Don't try to win.<br><span class="hl">Try not to lose ground.</span></h1>
    </header>

    <p v-if="onSampleSet" class="sample-warning" role="status">
      ⚠ Running on the sample set — only {{ positionCount }} starts, so positions will repeat.
      <span class="hint">The full library didn't load. If this is the live site, redeploy so <code>positions.json</code> ships.</span>
    </p>

    <div class="layout">
      <div class="board-col">
        <div class="board-frame">
          <div class="board-stage">
            <BoardPanel
              :fen="view.fen"
              :orientation="orientation"
              :turn-color="view.turnColor"
              :dests="view.dests"
              :movable-color="view.movableColor"
              :last-move="view.lastMove"
              :check="view.check"
              :view-only="view.viewOnly"
              @move="onMove"
            />
          </div>
        </div>

        <p :class="['status', phase]">
          <span v-if="searching" class="spinner" />
          {{ statusText }}
        </p>

        <!-- Persistent nav: scrub the run with ◀ / ▶ (or ← / →) and restart / move on.
             Always mounted — during play and on the run-over screen alike. -->
        <RunControls
          :ply="viewIndex"
          :total-plies="tip"
          :at-live="atLive"
          :can-scrub="tip > 0"
          :busy="phase === 'booting'"
          @prev="scrubBy(-1)"
          @next="scrubBy(1)"
          @live="viewPly = null"
          @restart="retryPosition"
          @next-position="nextPosition"
        />

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
          :locked="bankedAtStart"
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
        <SettingsPanel :banked="positionBanked" @drop-banked="dropBanked" />
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
.sample-warning {
  margin: 0 0 1.5rem;
  padding: 0.7rem 0.95rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--bad) 50%, var(--hairline));
  background: color-mix(in srgb, var(--bad) 12%, var(--surface));
  color: var(--text);
  font-size: 0.9rem;
  line-height: 1.45;
}
.sample-warning .hint {
  display: block;
  margin-top: 0.2rem;
  color: var(--text-muted);
  font-size: 0.82rem;
}
.sample-warning code {
  padding: 0.05em 0.3em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  font-size: 0.95em;
}
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  align-items: flex-start;
}
.board-col {
  flex: 0 0 auto;
  /* Pin the column to the board's footprint — the board (--board-size) plus the 12px
     frame padding on each side. Without a fixed width the column's max-content tracks
     its widest child, so a long line in the controls or the run-over / "Banked" summary
     below stretches the neon frame past the board and shifts the layout as it renders.
     --board-size is set here so the stage and board inherit the same value. */
  --board-size: min(80vmin, 480px);
  width: calc(var(--board-size) + 24px);
  min-width: 0;
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
