<script setup lang="ts">
// Live run readout: the player's positional win%, the drift gauge (cumulative
// win% lost vs the budget), and n / best-n. Pure presentation — every number
// arrives as a prop from useScoring via ChessTrainer; no engine or chess logic.
import type { RunStatus } from '~/lib/scoring'

const props = defineProps<{
  /** Player's win% at the current position (0–100). */
  winProb: number
  /** Cumulative win% lost vs best this run. */
  drift: number
  /** Drift budget; the run ends once drift reaches it. */
  budget: number
  /** Plies survived this run. */
  n: number
  /** Best n this session. */
  bestN: number
  status: RunStatus
}>()

const winPct = computed(() => Math.max(0, Math.min(100, props.winProb)))
const driftPct = computed(() => Math.min(100, (props.drift / props.budget) * 100))

const winTone = computed(() =>
  winPct.value >= 55 ? 'good' : winPct.value <= 45 ? 'bad' : 'even',
)
const driftTone = computed(() =>
  driftPct.value >= 80 ? 'bad' : driftPct.value >= 50 ? 'warn' : 'good',
)

const statusLabel: Record<RunStatus, string> = {
  active: '',
  blunder: 'Blunder — run over',
  budget: 'Budget spent — run over',
  'max-n': 'Held! 🎉',
  terminal: 'Terminal position',
}
</script>

<template>
  <section class="score">
    <div class="metric">
      <div class="metric-head">
        <span class="label">Your chances</span>
        <span class="value">{{ winPct.toFixed(0) }}%</span>
      </div>
      <div class="bar">
        <div :class="['fill', winTone]" :style="{ width: winPct + '%' }" />
      </div>
    </div>

    <div class="metric">
      <div class="metric-head">
        <span class="label">Drift</span>
        <span class="value">
          {{ drift.toFixed(0) }}<span class="muted"> / {{ budget }}</span>
        </span>
      </div>
      <div class="bar">
        <div :class="['fill', driftTone]" :style="{ width: driftPct + '%' }" />
      </div>
    </div>

    <div class="counters">
      <div class="counter">
        <span class="big">{{ n }}</span>
        <span class="label">plies survived</span>
      </div>
      <div class="counter">
        <span class="big muted">{{ bestN }}</span>
        <span class="label">session best</span>
      </div>
    </div>

    <p v-if="status !== 'active'" :class="['badge', status]">
      {{ statusLabel[status] }}
    </p>
  </section>
</template>

<style scoped>
.score {
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.metric-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.35rem;
}
.label {
  font-size: 0.78rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.value {
  font-size: 1.05rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.muted {
  color: #aaa;
  font-weight: 400;
}
.bar {
  height: 0.7rem;
  background: #ececec;
  border-radius: 0.4rem;
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 0.4rem;
  transition: width 0.35s ease, background-color 0.35s ease;
}
.fill.good { background: #16a34a; }
.fill.even { background: #9ca3af; }
.fill.warn { background: #f59e0b; }
.fill.bad { background: #dc2626; }
.counters {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.25rem;
}
.counter {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.big {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.big.muted {
  color: #bbb;
}
.badge {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}
.badge.blunder,
.badge.budget {
  background: #fee2e2;
  color: #991b1b;
}
.badge.max-n {
  background: #dcfce7;
  color: #166534;
}
.badge.terminal {
  background: #e5e7eb;
  color: #374151;
}
</style>
