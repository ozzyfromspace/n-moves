<script setup lang="ts">
// The persistent navigation panel under the board: a move scrubber on the left
// (when the run has moves) and the run actions on the right (Restart · Next). It's
// always mounted — during play, on the run-over screen, everywhere — so "go again"
// and "skip on" are one click away and survive refreshes alongside the run itself.
// Pure presentation: it owns no state, just buttons that emit. Scrubbing replays
// the player's own moves and the engine replies already on the board — never a hint.
const props = defineProps<{
  /** The frame currently viewed: 0 = start, totalPlies = the live tip. */
  ply: number
  /** Plies recorded this run (half-moves); the scrubber's upper bound. */
  totalPlies: number
  /** True when viewing the live tip (not scrubbed into the past). */
  atLive: boolean
  /** Whether there's anything to scrub (totalPlies > 0). */
  canScrub: boolean
  /** Disable the run actions while the engine is still booting. */
  busy?: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  live: []
  restart: []
  nextPosition: []
}>()

const posLabel = computed(() => {
  if (props.atLive) return 'live'
  if (props.ply === 0) return 'start'
  return `${props.ply} / ${props.totalPlies}`
})
</script>

<template>
  <div class="run-controls">
    <div v-if="canScrub" class="scrubber" role="group" aria-label="Review moves">
      <button
        class="scrub"
        :disabled="ply === 0"
        aria-label="Previous move"
        title="Previous move (←)"
        @click="emit('prev')"
      >◀</button>
      <span :class="['pos', 'tnum', { live: atLive }]" aria-live="polite">{{ posLabel }}</span>
      <button
        class="scrub"
        :disabled="atLive"
        aria-label="Next move"
        title="Next move (→)"
        @click="emit('next')"
      >▶</button>
      <button
        class="scrub jump"
        :disabled="atLive"
        aria-label="Jump to the live position"
        title="Back to live"
        @click="emit('live')"
      >⤓ live</button>
    </div>
    <div v-else class="scrub-hint">Play a move — then ← / → reviews the run.</div>

    <div class="actions">
      <button class="nm-btn ghost" :disabled="busy" @click="emit('restart')">↺ Restart</button>
      <button class="nm-btn" :disabled="busy" @click="emit('nextPosition')">Next →</button>
    </div>
  </div>
</template>

<style scoped>
.run-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem 1rem;
  margin-top: 1rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  background: linear-gradient(160deg, var(--surface-2), var(--surface) 70%);
}
.scrubber {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.scrub {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--bg-sunken);
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.scrub.jump {
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.scrub:hover:not(:disabled) {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
}
.scrub:active:not(:disabled) {
  background: var(--surface-2);
}
.scrub:disabled {
  opacity: 0.4;
  cursor: default;
}
.scrub:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 2px;
}
.pos {
  min-width: 3.4rem;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.pos.live {
  color: var(--neon-cyan);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.scrub-hint {
  font-size: 0.82rem;
  color: var(--text-dim);
}
.actions {
  display: inline-flex;
  gap: 0.55rem;
  margin-left: auto;
}
.actions .nm-btn {
  font-size: 0.95rem;
  padding: 0.5rem 0.95rem;
}
.actions .nm-btn:disabled {
  opacity: 0.5;
  cursor: default;
  filter: grayscale(0.3);
}
@media (max-width: 30rem) {
  .run-controls {
    justify-content: center;
  }
  .actions {
    margin-left: 0;
  }
}
</style>
