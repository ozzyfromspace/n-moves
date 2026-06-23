<script setup lang="ts">
// Compact light / dark / system segmented control for the top-nav. Drives useTheme,
// which writes <html data-theme> and persists the choice.
import type { ThemePref } from '~/composables/useTheme'

const { pref, set } = useTheme()

const opts: { v: ThemePref; icon: string; label: string }[] = [
  { v: 'light', icon: '☀', label: 'Light' },
  { v: 'dark', icon: '☾', label: 'Dark' },
  { v: 'system', icon: '◐', label: 'System' },
]
</script>

<template>
  <div class="toggle" role="group" aria-label="Theme">
    <button
      v-for="o in opts"
      :key="o.v"
      type="button"
      :class="['opt', { on: pref === o.v }]"
      :aria-pressed="pref === o.v"
      :title="`${o.label} theme`"
      @click="set(o.v)"
    >
      {{ o.icon }}
    </button>
  </div>
</template>

<style scoped>
.toggle {
  display: inline-flex;
  gap: 2px;
  margin-left: 0.4rem;
  padding: 3px;
  border-radius: 9px;
  background: var(--bg-sunken);
  border: 1px solid var(--hairline);
}
.opt {
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.5rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.opt:hover {
  color: var(--text);
}
.opt.on {
  color: var(--text-on-neon);
  background: var(--neon-cyan);
  box-shadow: 0 0 10px rgba(33, 243, 255, 0.4);
}
.opt:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 1px;
}
</style>
