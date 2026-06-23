<script setup lang="ts">
// Sidebar history: the most recent runs, read straight from the shared useHistory
// store (IndexedDB-backed). Pure presentation — ChessTrainer appends runs and calls
// load(); this just shows what's there, and quietly shows nothing extra before the
// first run is recorded.
import { RUN_STATUS_SHORT, isHeld, type RunRecord } from '~/lib/history'

const { recentRuns, error } = useHistory()

/** Epoch ms → a terse "3m" / "2h" / "1d" age. */
function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

function label(run: RunRecord): string {
  return RUN_STATUS_SHORT[run.status]
}
</script>

<template>
  <section class="history">
    <p v-if="recentRuns.length" class="caption">Recent runs</p>

    <ul v-if="recentRuns.length" class="runs">
      <li v-for="(run, i) in recentRuns" :key="run.id ?? i" class="run">
        <span class="dot" :class="isHeld(run.status) ? 'good' : 'bad'" />
        <span class="n tnum">{{ run.n }}</span>
        <span class="status">{{ label(run) }}</span>
        <span class="drift tnum">−{{ run.drift.toFixed(0) }}</span>
        <span class="when tnum">{{ ago(run.at) }}</span>
      </li>
    </ul>
    <p v-else-if="error" class="empty">{{ error }}</p>
    <p v-else class="empty">No runs yet — finish one to start your history.</p>
  </section>
</template>

<style scoped>
.history {
  border-radius: 12px;
  background: linear-gradient(160deg, var(--surface-2), var(--surface) 60%, var(--bg-sunken));
  border: 1px solid var(--hairline);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 30px -14px rgba(0, 0, 0, 0.7);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.caption {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.run {
  display: grid;
  grid-template-columns: 0.6rem 1.8rem 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.32rem 0.1rem;
  font-size: 0.82rem;
  border-top: 1px solid var(--hairline);
}
.run:first-child {
  border-top: 0;
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}
.dot.good {
  background: var(--good);
  box-shadow: 0 0 6px rgba(43, 255, 136, 0.7);
}
.dot.bad {
  background: var(--bad);
  box-shadow: 0 0 6px rgba(255, 59, 92, 0.7);
}
.n {
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--text);
}
.status {
  color: var(--text-muted);
}
.drift {
  color: var(--text-dim);
}
.when {
  color: var(--text-dim);
  min-width: 1.8rem;
  text-align: right;
}
.empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
