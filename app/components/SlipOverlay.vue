<script setup lang="ts">
// The freeze-on-slip teaching moment. When the player's move costs more than the
// slip threshold, ChessTrainer freezes the board (viewOnly) with the engine's
// best move drawn as a green arrow underneath, and floats this card over it: what
// you played, what the engine wanted, and the win% it cost. The loop waits here
// until the player acknowledges — this deliberate pause IS the feedback signal the
// trainer is built around. A light scrim keeps the board + arrow legible behind.
import { parseUciMove } from '~/lib/uci'

const props = defineProps<{
  /** The move the player made (long-algebraic). */
  played: string
  /** The engine's best move (long-algebraic) — also drawn as the board arrow. */
  best: string
  /** Win% lost vs best (≥ the slip threshold). */
  loss: number
}>()

const emit = defineEmits<{ continue: [] }>()

/** 'e2e4' → 'e2→e4' (with '=Q' on a promotion) for display. */
function pretty(uci: string): string {
  const m = parseUciMove(uci)
  if (!m) return uci
  return `${m.from}→${m.to}${m.promotion ? `=${m.promotion.toUpperCase()}` : ''}`
}

function dismiss(): void {
  emit('continue')
}

// Continue on Enter/Space/Escape too, so a slip never forces a reach for the mouse.
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
    e.preventDefault()
    dismiss()
  }
}

const btn = ref<HTMLButtonElement | null>(null)
onMounted(() => {
  window.addEventListener('keydown', onKey)
  btn.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="slip-overlay" @click.self="dismiss">
    <div class="card" role="alertdialog" aria-label="You slipped">
      <p class="lead">Slip · <span class="loss">−{{ loss.toFixed(1) }}%</span></p>
      <div class="moves">
        <div class="move">
          <span class="tag">You played</span>
          <b class="you">{{ pretty(played) }}</b>
        </div>
        <div class="move">
          <span class="tag">Engine wanted</span>
          <b class="best">{{ pretty(best) }}</b>
        </div>
      </div>
      <button ref="btn" class="continue" @click="dismiss">Continue →</button>
      <p class="hint">click anywhere · Enter</p>
    </div>
  </div>
</template>

<style scoped>
.slip-overlay {
  position: absolute;
  inset: 0;
  /* chessground pieces carry a z-index (up to 11 while dragging/animating) that
     bubbles to the shared stacking context, so an auto-z overlay paints UNDER
     them. Sit above the whole piece layer. */
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* Light enough that the frozen board + green best-move arrow stay readable. */
  background: rgba(17, 24, 39, 0.18);
  padding: 0.9rem;
  cursor: pointer;
}
.card {
  width: 100%;
  max-width: 22rem;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e5e7eb;
  border-radius: 0.6rem;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
  padding: 0.85rem 1rem 0.75rem;
  cursor: default;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
.lead {
  margin: 0 0 0.55rem;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.loss {
  color: #dc2626;
  font-variant-numeric: tabular-nums;
}
.moves {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.move {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.tag {
  font-size: 0.72rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.move b {
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}
.you {
  color: #b91c1c;
}
.best {
  color: #166534;
}
.continue {
  width: 100%;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  border: 1px solid #1a1a1a;
  border-radius: 0.4rem;
  background: #1a1a1a;
  color: #fff;
  cursor: pointer;
}
.continue:hover {
  background: #000;
}
.hint {
  margin: 0.45rem 0 0;
  text-align: center;
  font-size: 0.74rem;
  color: #9ca3af;
}
</style>
