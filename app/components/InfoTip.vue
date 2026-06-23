<script setup lang="ts">
// A small "?" chip that reveals a plain-language description of a term on hover, focus,
// or tap (a neon speech-bubble popover). Used beside dashboard labels so the player
// learns what each number means without cluttering the panel. Keep it out of any
// clip-path / overflow:hidden container — the bubble is absolutely positioned and would
// be cropped.
defineProps<{
  /** The term being explained (for the aria-label). */
  label: string
  /** Plain-language description shown in the bubble. */
  text: string
}>()

const open = ref(false)
</script>

<template>
  <span
    class="infotip"
    tabindex="0"
    role="button"
    :aria-label="`${label}: ${text}`"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focus="open = true"
    @blur="open = false"
    @click.stop="open = !open"
    @keydown.escape="open = false"
  >
    <span class="q" aria-hidden="true">?</span>
    <span v-show="open" class="bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.infotip {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
  cursor: help;
  outline: none;
}
.q {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: var(--neon-cyan);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.infotip:hover .q,
.infotip:focus .q {
  border-color: var(--neon-cyan);
  box-shadow: 0 0 8px rgba(33, 243, 255, 0.45);
}
.bubble {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: min(14rem, calc(100vw - 1.5rem));
  padding: 0.5rem 0.65rem;
  font-family: var(--font-body);
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1.42;
  letter-spacing: normal;
  text-transform: none;
  text-align: left;
  color: var(--text);
  background: var(--bg-sunken);
  border: 1px solid var(--neon-cyan);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(33, 243, 255, 0.22);
  z-index: 50;
}
.bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--neon-cyan);
}
</style>
