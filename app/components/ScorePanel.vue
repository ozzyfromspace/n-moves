<script setup lang="ts">
// Live run readout: positional win%, the drift gauge (cumulative win% lost vs budget),
// moves survived toward this run's level, and a single contextual progress track —
// green pips toward the next level on a win streak, red strikes toward a demotion when
// you're busting. Pure presentation; every number is a prop from ChessTrainer.
import type { RunStatus } from '~/lib/scoring'

const props = defineProps<{
  /** Player's win% at the current position (0–100). */
  winProb: number
  /** Cumulative win% lost vs best this run. */
  drift: number
  /** Drift budget; the run ends once drift reaches it. */
  budget: number
  /** Your moves survived this run. */
  n: number
  /** This run's survival target — the level in play. */
  target: number
  /** Current ladder level. */
  level: number
  /** Consecutive clean runs banked at this level. */
  streak: number
  /** Consecutive busts at this level. */
  busts: number
  /** Clean runs in a row needed to climb a level. */
  winsToAdvance: number
  /** Busts in a row that drop a level. */
  lossesToDemote: number
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

// At most one of streak/busts is ever non-zero. When busting, show the red demotion
// track; otherwise the green climb track.
const failing = computed(() => props.busts > 0)
const pipTotal = computed(() => (failing.value ? props.lossesToDemote : props.winsToAdvance))
const pipLit = computed(() => (failing.value ? props.busts : props.streak))
const trackCap = computed(() => {
  if (failing.value) {
    const left = props.lossesToDemote - props.busts
    return props.level > 1 ? `${left} more → level ${props.level - 1}` : 'hold level 1'
  }
  if (props.streak === 0) return `${props.winsToAdvance} clean → level ${props.level + 1}`
  return `${props.winsToAdvance - props.streak} more → level ${props.level + 1}`
})

const statusLabel: Record<RunStatus, string> = {
  active: '',
  blunder: 'Blunder — run over',
  budget: 'Drift spent — run over',
  'max-n': 'Clean run! 🎉',
  terminal: 'Game ended',
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
        <span class="big">{{ n }}<span class="den"> / {{ target }}</span></span>
        <span class="label">moves survived</span>
      </div>
      <div class="counter">
        <span class="big">{{ level }}</span>
        <span class="label">level</span>
      </div>
    </div>

    <div class="track">
      <span class="pips" role="img" :aria-label="`${pipLit} of ${pipTotal}`">
        <span v-for="i in pipTotal" :key="i" :class="['pip', { on: i <= pipLit, strike: failing }]" />
      </span>
      <span class="track-cap">{{ trackCap }}</span>
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
.den {
  font-size: 1rem;
  font-weight: 600;
  color: #9ca3af;
}
.track {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: -0.4rem;
}
.pips {
  display: inline-flex;
  gap: 0.3rem;
}
.pip {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #e5e7eb;
  box-shadow: inset 0 0 0 1px #d1d5db;
}
.pip.on { background: #16a34a; box-shadow: none; }
.pip.on.strike { background: #dc2626; }
.track-cap {
  font-size: 0.74rem;
  color: #9ca3af;
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
