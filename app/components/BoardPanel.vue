<script setup lang="ts">
// A controlled chessground board: position state flows in through props, the
// user's attempted move flows out through `@move`. It holds NO chess rules —
// the parent's single chess.js (useChessGame) validates the emitted move and
// feeds the result back as a new `fen`, which chessground animates. Opponent
// replies therefore need no imperative call: just update the props.
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Color, Dests, Key, MoveMetadata } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'

import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'

const props = withDefaults(
  defineProps<{
    fen: string
    orientation?: Color
    /** Whose turn it is — drives premove/coords and check highlighting. */
    turnColor?: Color
    /** Legal destinations per origin square, from chess.js. */
    dests?: Dests
    /** Which side the human may move now; undefined locks all pieces. */
    movableColor?: Color | 'both'
    lastMove?: [Key, Key]
    check?: boolean
    /** Hard input lock (engine thinking / run over). */
    viewOnly?: boolean
    /** Board annotations (analysis arrows etc.); cleared by passing []. */
    autoShapes?: DrawShape[]
  }>(),
  {
    orientation: 'white',
    check: false,
    viewOnly: false,
  },
)

const emit = defineEmits<{
  move: [payload: { orig: Key; dest: Key; metadata: MoveMetadata }]
}>()

const rootEl = ref<HTMLElement | null>(null)
let cg: Api | undefined

function buildConfig(): Config {
  return {
    fen: props.fen,
    orientation: props.orientation,
    turnColor: props.turnColor,
    lastMove: props.lastMove,
    check: props.check,
    viewOnly: props.viewOnly,
    coordinates: true,
    animation: { enabled: true, duration: 200 },
    highlight: { lastMove: true, check: true },
    movable: {
      free: false, // only chess.js-supplied dests are legal
      color: props.movableColor,
      dests: props.dests,
      showDests: true,
      events: {
        after: (orig, dest, metadata) => emit('move', { orig, dest, metadata }),
      },
    },
    drawable: { enabled: true, visible: true },
  }
}

onMounted(() => {
  if (!rootEl.value) return
  // chessground's bindBoard() attaches its pointer listeners ONLY when viewOnly
  // is false at init, and never re-binds them when you toggle viewOnly off later.
  // A board first painted with viewOnly:true is therefore inert for its entire
  // lifetime (it reads as a static picture). So we always initialise unlocked —
  // listeners bound — then apply the real lock state immediately afterwards.
  cg = Chessground(rootEl.value, { ...buildConfig(), viewOnly: false })
  cg.set({ viewOnly: props.viewOnly })
  cg.setAutoShapes(props.autoShapes ?? [])
})

onBeforeUnmount(() => {
  cg?.destroy()
  cg = undefined
})

// One atomic re-sync whenever any position-affecting prop changes. Vue batches
// the simultaneous updates from a single chess.js move into one cg.set().
// Orientation is deliberately NOT here — it needs the unlock dance below.
watch(
  () => [
    props.fen,
    props.turnColor,
    props.dests,
    props.movableColor,
    props.lastMove,
    props.check,
    props.viewOnly,
  ],
  () => {
    cg?.set({
      fen: props.fen,
      turnColor: props.turnColor,
      lastMove: props.lastMove,
      check: props.check,
      viewOnly: props.viewOnly,
      movable: { color: props.movableColor, dests: props.dests },
    })
  },
)

// Orientation flips need their own handling. chessground re-creates the board
// element on an orientation change (set → toggleOrientation → redrawAll), and
// bindBoard SKIPS attaching pointer listeners while viewOnly is true. A flip during
// a locked phase therefore leaves the fresh board inert — the viewOnly-init trap,
// re-triggered. Every black-to-move start arrives via the locked 'scoring' phase, so
// this bit every flipped board. Flip while explicitly unlocked (so the re-bind
// takes), then restore the real lock; the order of the three sets matters.
watch(
  () => props.orientation,
  () => {
    if (!cg) return
    cg.set({ viewOnly: false })
    cg.set({ orientation: props.orientation })
    cg.set({ viewOnly: props.viewOnly })
  },
)

watch(
  () => props.autoShapes,
  shapes => cg?.setAutoShapes(shapes ?? []),
)
</script>

<template>
  <div ref="rootEl" class="cg-wrap board" />
</template>

<style scoped>
/* chessground fills this box; it has no intrinsic size, so we give it one. */
.board {
  width: var(--board-size, min(80vmin, 480px));
  height: var(--board-size, min(80vmin, 480px));
}

/* Custom neon-cool board (replaces the wood theme): calm, readable squares so both
   piece colours stay legible, with neon action highlights. The frame carries the glow. */
.board :deep(cg-board) {
  background-color: #d8e0f2;
  background-image: conic-gradient(
    #46588a 90deg,
    transparent 90deg 180deg,
    #46588a 180deg 270deg,
    transparent 270deg
  );
  background-size: 25% 25%;
}
.board :deep(coords coord) {
  color: #eaf0ff;
  font-weight: 700;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
}
.board :deep(square.last-move) {
  background: rgba(33, 243, 255, 0.26);
  box-shadow: inset 0 0 0 2px rgba(33, 243, 255, 0.55);
}
.board :deep(square.selected) {
  background: rgba(33, 243, 255, 0.42);
}
.board :deep(square.move-dest) {
  /* Bright cyan core + dark navy rim so the dot reads on light AND dark squares
     (a flat translucent cyan is too close to the pale squares). Fixed colours —
     the board is theme-independent. */
  background: radial-gradient(
    circle,
    #21f3ff 15%,
    rgba(6, 14, 26, 0.62) 15%,
    rgba(6, 14, 26, 0.62) 21%,
    transparent 22%
  );
}
.board :deep(square.oc.move-dest) {
  /* capture: a bold magenta ring hugging the square edge. */
  background: radial-gradient(
    transparent 0%,
    transparent 54%,
    rgba(255, 43, 214, 0.78) 56%,
    rgba(255, 43, 214, 0.78) 64%,
    transparent 66%
  );
}
.board :deep(square.check) {
  background: radial-gradient(
    rgba(255, 59, 92, 0.95) 0%,
    rgba(255, 59, 92, 0.55) 28%,
    transparent 65%
  );
}
.board :deep(square.premove-dest) {
  background: radial-gradient(rgba(255, 43, 214, 0.4) 21%, transparent 22%);
}
</style>
