<script setup lang="ts">
// Sidebar history: the persisted all-time best (the standing goal) and the most
// recent runs, read straight from the shared useHistory store (IndexedDB-backed).
// Pure presentation — ChessTrainer appends runs and calls load(); this just shows
// what's there, and quietly shows nothing extra before the first run is recorded.
import { RUN_STATUS_SHORT, isHeld, type RunRecord } from '~/lib/history'

// all-time best lives in ScorePanel (the live scoreboard); this panel is the log.
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
        <span class="n">{{ run.n }}</span>
        <span class="status">{{ label(run) }}</span>
        <span class="drift">−{{ run.drift.toFixed(0) }}</span>
        <span class="when">{{ ago(run.at) }}</span>
      </li>
    </ul>
    <p v-else-if="error" class="empty">{{ error }}</p>
    <p v-else class="empty">No runs yet — finish one to start your history.</p>
  </section>
</template>

<style scoped>
.history {
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.caption {
  margin: 0;
  font-size: 0.74rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.run {
  display: grid;
  grid-template-columns: 0.6rem 1.8rem 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.28rem 0.1rem;
  font-size: 0.82rem;
  border-top: 1px solid #f1f1f1;
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
  background: #16a34a;
}
.dot.bad {
  background: #dc2626;
}
.n {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.status {
  color: #6b7280;
}
.drift {
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.when {
  color: #c0c4cc;
  font-variant-numeric: tabular-nums;
  min-width: 1.8rem;
  text-align: right;
}
.empty {
  margin: 0;
  font-size: 0.8rem;
  color: #9ca3af;
}
</style>
