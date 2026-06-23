<script setup lang="ts">
// The run-over summary, shown BELOW the board (not over it) so the final position
// stays visible to study. It reports how the run ended and the consequence for the
// ladder — climb, hold, strike, or demotion — plus drift spent and the win%
// trajectory. It deliberately does NOT reveal the engine's move on a failure: working
// that out yourself is the exercise. Pure presentation; numbers arrive as props from
// ChessTrainer (useScoring + useLadder).
import type { RunStatus } from '~/lib/scoring'

const props = defineProps<{
  status: RunStatus
  /** Your moves survived this run. */
  n: number
  /** The level this run was played at (survive this many of your moves). */
  target: number
  /** Current ladder level after this run is folded in. */
  level: number
  /** Consecutive clean runs at this level after this run. */
  streak: number
  /** Consecutive busts at this level after this run. */
  busts: number
  /** Clean runs in a row needed to climb a level. */
  winsToAdvance: number
  /** Busts in a row that drop a level. */
  lossesToDemote: number
  /** Cumulative win% lost vs best. */
  drift: number
  budget: number
  blunderCap: number
  /** Win%-pts the run-ending move cost, when that was a single blunder (else null). */
  fatalLoss?: number | null
  /** Player-perspective win% at each ply faced; drives the sparkline. */
  winHistory: number[]
  /** Set when the run stopped on an unexpected error rather than a rule. */
  runError?: string | null
}>()

const emit = defineEmits<{ next: []; retry: [] }>()

const won = computed(() => props.status === 'max-n')
const busted = computed(() => props.status === 'blunder' || props.status === 'budget')
// A win that pushed the streak over the top; a bust that pushed busts over the top.
const advanced = computed(() => won.value && props.level > props.target)
const demoted = computed(() => busted.value && props.level < props.target)
const tone = computed(() =>
  props.runError || props.status === 'terminal' ? 'neutral' : won.value ? 'good' : 'bad',
)

const headline = computed(() => {
  if (props.runError) return 'Run stopped'
  if (advanced.value) return 'Level up!'
  if (demoted.value) return 'Demoted ↓'
  switch (props.status) {
    case 'max-n': return 'Clean run ✓'
    case 'blunder': return 'Blunder'
    case 'budget': return 'Drift spent'
    case 'terminal': return 'Game over'
    default: return 'Run over'
  }
})

const detail = computed(() => {
  if (props.runError) return props.runError
  const wta = props.winsToAdvance
  const ltd = props.lossesToDemote
  const t = props.target
  if (advanced.value) return `${wta} clean in a row — welcome to level ${props.level}.`
  if (demoted.value) return `${ltd} busts in a row — back to level ${props.level}. Earn it again.`
  switch (props.status) {
    case 'max-n':
      return `Clean at level ${t}. ${props.streak}/${wta} — ${wta - props.streak} more to level up.`
    case 'blunder':
    case 'budget':
      return t > 1
        ? `Bust ${props.busts}/${ltd} at level ${t} — ${ltd - props.busts} more drops you a level.`
        : `Bust ${props.busts}/${ltd} at level 1 — the floor, but keep it clean.`
    case 'terminal':
      return `The game ended before move ${t} — level ${t} stands.`
    default:
      return ''
  }
})

// One contextual progress track: green pips toward a climb on a win, red strikes
// toward a demotion on a bust. A climb/drop lights the whole row for the beat.
const showPips = computed(() => won.value || busted.value)
const pipTotal = computed(() => (busted.value ? props.lossesToDemote : props.winsToAdvance))
const pipLit = computed(() => {
  if (busted.value) return demoted.value ? props.lossesToDemote : props.busts
  return advanced.value ? props.winsToAdvance : props.streak
})
const pipCap = computed(() => {
  if (advanced.value) return `level ${props.target} cleared`
  if (demoted.value) return `now at level ${props.level}`
  if (won.value) return `${props.winsToAdvance - props.streak} more to level up`
  return props.target > 1
    ? `${props.lossesToDemote - props.busts} more → level ${props.target - 1}`
    : 'hold level 1'
})

// Sparkline geometry: win% over the plies faced, 100% top, 50% reference midline.
// preserveAspectRatio="none" stretches the viewBox to fill the box; the stroke is
// kept uniform with vector-effect: non-scaling-stroke (in CSS).
const W = 100
const H = 40
const midY = H / 2
const points = computed(() => {
  const h = props.winHistory
  if (h.length === 0) return ''
  const y = (wp: number) => H - (Math.max(0, Math.min(100, wp)) / 100) * H
  if (h.length === 1) return `0,${y(h[0]!)} ${W},${y(h[0]!)}`
  return h
    .map((wp, i) => `${((i / (h.length - 1)) * W).toFixed(2)},${y(wp).toFixed(2)}`)
    .join(' ')
})
</script>

<template>
  <section class="run-summary" aria-label="Run over">
    <div :class="['card', tone]">
      <p :class="['headline', tone]">{{ headline }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>

      <div class="stats">
        <div class="stat">
          <span class="num tnum">{{ n }}<span class="den">/{{ target }}</span></span>
          <span class="lbl">survived</span>
        </div>
        <div class="stat">
          <span class="num tnum">{{ drift.toFixed(0) }}<span class="den">/{{ budget }}</span></span>
          <span class="lbl">drift spent</span>
        </div>
        <div class="stat">
          <span class="num tnum">{{ level }}</span>
          <span class="lbl">level<template v-if="advanced"> ▲</template><template v-else-if="demoted"> ▼</template></span>
        </div>
      </div>

      <div v-if="showPips" class="track">
        <span class="pips" role="img" :aria-label="`${pipLit} of ${pipTotal}`">
          <span v-for="i in pipTotal" :key="i" :class="['pip', { on: i <= pipLit, strike: busted }]" />
        </span>
        <span class="track-cap">{{ pipCap }}</span>
      </div>

      <p v-if="status === 'blunder' && fatalLoss != null" class="cost">
        That move cost <span class="loss tnum">−{{ fatalLoss.toFixed(1) }}%</span> — find a better one.
      </p>

      <template v-if="winHistory.length">
        <svg class="spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
          <line class="mid" :x1="0" :y1="midY" :x2="W" :y2="midY" />
          <polyline :class="['line', tone]" :points="points" />
        </svg>
        <p class="spark-cap">win% across the run</p>
      </template>

      <div class="controls">
        <button class="nm-btn" @click="emit('next')">Next position →</button>
        <button class="nm-btn ghost" @click="emit('retry')">Retry this one</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.run-summary {
  margin-top: 1rem;
  filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.55));
}
.card {
  position: relative;
  --c: 16px;
  clip-path: polygon(
    0 0,
    calc(100% - var(--c)) 0,
    100% var(--c),
    100% 100%,
    var(--c) 100%,
    0 calc(100% - var(--c))
  );
  background: linear-gradient(160deg, var(--surface-2), var(--surface) 58%, var(--bg-sunken));
  padding: 1.1rem 1.3rem 1.2rem;
}
/* Neon gradient border that follows the notch (behind the body). */
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  margin: -1.5px;
  clip-path: inherit;
  background: linear-gradient(135deg, var(--hairline), var(--text-dim));
}
.card.good::after {
  background: linear-gradient(135deg, var(--good), var(--neon-cyan));
}
.card.bad::after {
  background: linear-gradient(135deg, var(--neon-magenta), var(--bad));
}
.card > * {
  position: relative;
}
.headline {
  margin: 0;
  font-family: var(--font-display);
  font-size: 2.1rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
}
.headline.good {
  color: var(--good);
  text-shadow: 0 0 18px rgba(43, 255, 136, 0.5);
}
.headline.bad {
  color: var(--bad);
  text-shadow: 0 0 18px rgba(255, 59, 92, 0.45);
}
.headline.neutral {
  color: var(--text-muted);
}
.detail {
  margin: 0.3rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}
.stats {
  display: flex;
  gap: 1.5rem;
  margin: 1rem 0 0.7rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.num {
  font-family: var(--font-display);
  font-size: 2rem;
  line-height: 0.9;
  letter-spacing: 0.02em;
  color: var(--text);
}
.den {
  font-size: 1.1rem;
  color: var(--text-dim);
}
.lbl {
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.track {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0.1rem 0 0.4rem;
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
  font-size: 0.74rem;
  color: var(--text-muted);
}
.cost {
  margin: 0.2rem 0 0;
  font-size: 0.88rem;
  color: var(--text-muted);
}
.cost .loss {
  color: var(--bad);
  font-weight: 700;
}
.spark {
  width: 100%;
  height: 2.6rem;
  display: block;
  background: var(--bg-sunken);
  border: 1px solid var(--hairline);
  border-radius: 0.4rem;
  margin-top: 0.6rem;
}
.mid {
  stroke: var(--hairline);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}
.line {
  fill: none;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 4px currentColor);
}
.line.good {
  stroke: var(--good);
}
.line.bad {
  stroke: var(--bad);
}
.line.neutral {
  stroke: var(--text-muted);
}
.spark-cap {
  margin: 0.3rem 0 0;
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-dim);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1rem;
}
.controls .nm-btn {
  flex: 1;
  font-size: 1rem;
  padding: 0.55rem 0.9rem;
}
</style>
