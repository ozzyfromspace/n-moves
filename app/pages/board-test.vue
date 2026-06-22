<script setup lang="ts">
// Smoke-test harness for BoardPanel + useChessGame (build-order step 2).
// Exercises: legal user moves (illegal ones rejected by chess.js dests),
// a programmatic "opponent" reply (proving fen-driven animated moves),
// the slip arrow (setAutoShapes), orientation flip, and the input lock.
// Throwaway: ChessTrainer.vue replaces this in the scoring-loop step.
import type { DrawShape } from 'chessground/draw'
import type { Color, Key } from 'chessground/types'

useHead({ title: 'n-moves — board smoke test' })

// A real mid-game position (white to move), so legality/captures/checks get a
// proper workout rather than the symmetric opening.
const SMOKE_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'

const {
  fen,
  turnColor,
  dests,
  lastMove,
  check,
  isGameOver,
  terminal,
  moveCount,
  move,
  load,
  raw,
} = useChessGame(SMOKE_FEN)

const humanColor = ref<Color>('white')
const freePlay = ref(false)
const locked = ref(false)
const arrow = ref<DrawShape[]>([])

const orientation = computed<Color>(() => humanColor.value)
const movableColor = computed<Color | 'both' | undefined>(() => {
  if (locked.value || isGameOver.value) return undefined
  if (freePlay.value) return 'both'
  return turnColor.value === humanColor.value ? humanColor.value : undefined
})

const status = computed(() => {
  if (terminal.value) return `Game over — ${terminal.value}`
  return `${turnColor.value} to move`
})

let replyTimer: ReturnType<typeof setTimeout> | undefined

function onMove(payload: { orig: Key; dest: Key }) {
  const result = move({ from: payload.orig, to: payload.dest })
  if (!result) return
  arrow.value = [] // a fresh move clears any slip arrow
  if (freePlay.value || isGameOver.value) return
  // Programmatic opponent: a random legal reply after a beat. Proves the board
  // locks while "thinking" and animates a parent-driven move.
  replyTimer = setTimeout(playRandomReply, 450)
}

function playRandomReply() {
  const legal = raw().moves({ verbose: true })
  if (!legal.length) return
  const pick = legal[Math.floor(Math.random() * legal.length)]!
  move({ from: pick.from, to: pick.to, promotion: pick.promotion })
}

// Stand-in for the engine's best-move arrow: point at the first legal move.
function drawSampleArrow() {
  const first = raw().moves({ verbose: true })[0]
  if (!first) return
  arrow.value = [{ orig: first.from, dest: first.to, brush: 'green' }]
}

function clearArrow() {
  arrow.value = []
}

function flip() {
  humanColor.value = humanColor.value === 'white' ? 'black' : 'white'
}

function resetPosition() {
  clearTimeout(replyTimer)
  arrow.value = []
  load(SMOKE_FEN)
}

onBeforeUnmount(() => clearTimeout(replyTimer))
</script>

<template>
  <main class="harness">
    <h1>BoardPanel smoke test</h1>

    <div class="layout">
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

      <section class="panel">
        <p class="status">{{ status }}</p>
        <dl class="readout">
          <dt>n (plies)</dt>
          <dd>{{ moveCount }}</dd>
          <dt>human</dt>
          <dd>{{ humanColor }}</dd>
          <dt>movable</dt>
          <dd>{{ movableColor ?? 'locked' }}</dd>
        </dl>

        <div class="controls">
          <button @click="flip">Flip board</button>
          <button @click="locked = !locked">{{ locked ? 'Unlock' : 'Lock' }} input</button>
          <button @click="freePlay = !freePlay">
            {{ freePlay ? 'Vs random' : 'Free play' }}
          </button>
          <button @click="drawSampleArrow">Draw arrow</button>
          <button @click="clearArrow">Clear arrow</button>
          <button @click="resetPosition">Reset</button>
        </div>

        <p class="fen">{{ fen }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.harness {
  max-width: 56rem;
  margin: 2rem auto;
  padding: 0 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
h1 {
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  align-items: flex-start;
}
.panel {
  flex: 1 1 16rem;
  min-width: 16rem;
}
.status {
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: capitalize;
  margin: 0 0 0.75rem;
}
.readout {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin: 0 0 1rem;
  font-size: 0.9rem;
}
.readout dt {
  color: #888;
}
.readout dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  text-transform: capitalize;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.controls button {
  padding: 0.4rem 0.75rem;
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  background: #fff;
  cursor: pointer;
}
.controls button:hover {
  border-color: #888;
}
.fen {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: #666;
  word-break: break-all;
  margin: 0;
}
</style>
