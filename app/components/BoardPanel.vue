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
import 'chessground/assets/chessground.brown.css'
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
    /** Hard input lock (engine thinking / frozen slip). */
    viewOnly?: boolean
    /** Engine annotations (e.g. the slip arrow); cleared by passing []. */
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
</style>
