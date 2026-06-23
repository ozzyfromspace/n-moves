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
  if (advanced.value) return 'Level up! 🎉'
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
    <div class="card">
      <p :class="['headline', tone]">{{ headline }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>

      <div class="stats">
        <div class="stat">
          <span class="num">{{ n }}<span class="den">/{{ target }}</span></span>
          <span class="lbl">survived</span>
        </div>
        <div class="stat">
          <span class="num">{{ drift.toFixed(0) }}<span class="den">/{{ budget }}</span></span>
          <span class="lbl">drift spent</span>
        </div>
        <div class="stat">
          <span class="num">{{ level }}</span>
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
        That move cost <span class="loss">−{{ fatalLoss.toFixed(1) }}%</span> — find a better one.
      </p>

      <template v-if="winHistory.length">
        <svg class="spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
          <line class="mid" :x1="0" :y1="midY" :x2="W" :y2="midY" />
          <polyline :class="['line', tone]" :points="points" />
        </svg>
        <p class="spark-cap">win% across the run</p>
      </template>

      <div class="controls">
        <button class="primary" @click="emit('next')">Next position →</button>
        <button @click="emit('retry')">Retry this one</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.run-summary {
  margin-top: 0.85rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
.card {
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.7rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  padding: 1rem 1.15rem 1.05rem;
}
.headline {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.headline.good { color: #166534; }
.headline.bad { color: #b91c1c; }
.headline.neutral { color: #4b5563; }
.detail {
  margin: 0.25rem 0 0;
  color: #4b5563;
  font-size: 0.9rem;
}
.stats {
  display: flex;
  gap: 1.4rem;
  margin: 0.95rem 0 0.7rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}
.num {
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.den {
  font-size: 0.95rem;
  font-weight: 600;
  color: #9ca3af;
}
.lbl {
  font-size: 0.72rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.track {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0.1rem 0 0.35rem;
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
  font-size: 0.76rem;
  color: #6b7280;
}
.cost {
  margin: 0.1rem 0 0;
  font-size: 0.86rem;
  color: #444;
}
.cost .loss {
  color: #dc2626;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.spark {
  width: 100%;
  height: 2.6rem;
  display: block;
  background: #f8fafc;
  border-radius: 0.4rem;
  margin-top: 0.5rem;
}
.mid {
  stroke: #d1d5db;
  stroke-width: 1;
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}
.line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.line.good { stroke: #16a34a; }
.line.bad { stroke: #dc2626; }
.line.neutral { stroke: #9ca3af; }
.spark-cap {
  margin: 0.3rem 0 0;
  text-align: center;
  font-size: 0.72rem;
  color: #9ca3af;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.95rem;
}
.controls button {
  flex: 1;
  padding: 0.55rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  background: #fff;
  cursor: pointer;
}
.controls button:hover { border-color: #888; }
.controls button.primary {
  background: #1a1a1a;
  color: #fff;
  border-color: #1a1a1a;
}
.controls button.primary:hover { background: #000; }
</style>
