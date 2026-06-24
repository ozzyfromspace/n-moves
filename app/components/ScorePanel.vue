<script setup lang="ts">
// Live run readout: positional win%, the drift gauge (cumulative win% lost vs budget),
// moves survived toward this run's level, and a single contextual progress track —
// green pips toward the next level on a win streak, red strikes toward a demotion when
// you're busting. Plain-language InfoTips explain each term. Pure presentation; every
// number is a prop from ChessTrainer.
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
  'max-n': 'Clean run!',
  terminal: 'Game ended',
  // The live run state machine never enters 'forfeit' (a bail is recorded directly, then a
  // fresh run starts), so this label is just here to keep the map total.
  forfeit: 'Skipped',
}
</script>

<template>
  <section class="score nm-panel">
    <div class="metric">
      <div class="metric-head">
        <span class="label">Your chances
          <InfoTip
            label="Your chances"
            text="Your win odds from this exact position, per the engine. 50% is dead even."
          />
        </span>
        <span class="value tnum">{{ winPct.toFixed(0) }}%</span>
      </div>
      <div class="bar">
        <div :class="['fill', winTone]" :style="{ width: winPct + '%' }" />
      </div>
    </div>

    <div class="metric">
      <div class="metric-head">
        <span class="label">Drift
          <InfoTip
            label="Drift"
            text="Total win% you've bled vs the engine's best this run — your mistake budget. Fill the bar and the run ends."
          />
        </span>
        <span class="value tnum">{{ drift.toFixed(0) }}<span class="muted"> / {{ budget }}</span></span>
      </div>
      <div class="bar">
        <div :class="['fill', driftTone]" :style="{ width: driftPct + '%' }" />
      </div>
    </div>

    <div class="counters">
      <div class="counter">
        <span class="big tnum">{{ n }}<span class="den"> / {{ target }}</span></span>
        <span class="label">moves survived
          <InfoTip
            label="Moves survived"
            text="Strong moves you've made in a row this run, out of this level's target."
          />
        </span>
      </div>
      <div class="counter">
        <span class="big tnum cyan">{{ level }}</span>
        <span class="label">level
          <InfoTip
            label="Level"
            text="How many strong moves in a row you must string together. Stay consistent to climb."
          />
        </span>
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
  padding: 1.1rem 1.2rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1.05rem;
}
.metric-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.4rem;
}
.label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.value {
  font-family: var(--font-display);
  font-size: 1.5rem;
  letter-spacing: 0.02em;
  color: var(--text);
}
.muted {
  color: var(--text-dim);
}
.bar {
  height: 0.7rem;
  background: var(--bg-sunken);
  border-radius: 0.4rem;
  border: 1px solid var(--hairline);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 0.4rem;
  transition: width 0.4s ease, background-color 0.35s ease, box-shadow 0.35s ease;
}
.fill.good {
  background: linear-gradient(90deg, var(--good), var(--neon-cyan));
  box-shadow: 0 0 12px rgba(43, 255, 136, 0.5);
}
.fill.even {
  background: linear-gradient(90deg, #5e6a88, #9aa6c4);
}
.fill.warn {
  background: linear-gradient(90deg, var(--warn), #ff8a3b);
  box-shadow: 0 0 12px rgba(255, 200, 59, 0.45);
}
.fill.bad {
  background: linear-gradient(90deg, var(--neon-magenta), var(--bad));
  box-shadow: 0 0 14px rgba(255, 59, 92, 0.55);
}
.counters {
  display: flex;
  gap: 1.6rem;
  margin-top: 0.1rem;
}
.counter {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.big {
  font-family: var(--font-display);
  font-size: 2.5rem;
  line-height: 0.9;
  letter-spacing: 0.02em;
  color: var(--text);
}
.big.cyan {
  color: var(--neon-cyan);
  text-shadow: 0 0 16px rgba(33, 243, 255, 0.5);
}
.den {
  font-size: 1.2rem;
  color: var(--text-dim);
}
.track {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: -0.2rem;
}
.pips {
  display: inline-flex;
  gap: 0.32rem;
}
.pip {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 50%;
  background: var(--bg-sunken);
  border: 1px solid var(--hairline);
}
.pip.on {
  background: var(--good);
  border-color: var(--good);
  box-shadow: 0 0 8px rgba(43, 255, 136, 0.7);
}
.pip.on.strike {
  background: var(--bad);
  border-color: var(--bad);
  box-shadow: 0 0 8px rgba(255, 59, 92, 0.7);
}
.track-cap {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
.badge {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.05em;
  text-align: center;
  border: 1px solid transparent;
}
.badge.blunder,
.badge.budget {
  background: rgba(255, 59, 92, 0.12);
  border-color: rgba(255, 59, 92, 0.4);
  color: var(--bad);
}
.badge.max-n {
  background: rgba(43, 255, 136, 0.12);
  border-color: rgba(43, 255, 136, 0.4);
  color: var(--good);
}
.badge.terminal {
  background: var(--surface-2);
  border-color: var(--hairline);
  color: var(--text-muted);
}
</style>
