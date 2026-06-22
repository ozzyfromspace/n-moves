<script setup lang="ts">
// The run-over screen, floated over the (frozen) final board. Shows how the run
// ended, how far the player got (plies survived + session best), how much of the
// drift budget they spent, the win% trajectory across the run as a sparkline, and
// the move that ended it when that was a displayed slip. Buttons hand control back
// to ChessTrainer to load the next position or retry this one. Pure presentation.
import type { RunStatus } from '~/lib/scoring'
import { parseUciMove } from '~/lib/uci'

const props = defineProps<{
  status: RunStatus
  /** Plies survived this run. */
  n: number
  /** Best n this session. */
  bestN: number
  /** Cumulative win% lost vs best. */
  drift: number
  budget: number
  blunderCap: number
  /** Player-perspective win% at each ply faced; drives the sparkline. */
  winHistory: number[]
  /** The move that ended the run, when it was a displayed slip (else null). */
  fatalSlip?: { played: string; best: string; loss: number } | null
  /** Set when the run stopped on an unexpected error rather than a rule. */
  runError?: string | null
}>()

const emit = defineEmits<{ next: []; retry: [] }>()

const isRecord = computed(() => props.n > 0 && props.n >= props.bestN)
const tone = computed(() => (props.status === 'max-n' ? 'good' : 'bad'))

const headline = computed(() => {
  if (props.runError) return 'Run stopped'
  switch (props.status) {
    case 'max-n': return 'Run held! 🎉'
    case 'blunder': return 'Blunder'
    case 'budget': return 'Drift spent'
    case 'terminal': return 'Game over'
    default: return 'Run over'
  }
})

const detail = computed(() => {
  if (props.runError) return props.runError
  switch (props.status) {
    case 'max-n': return `You matched the engine for ${props.n} plies.`
    case 'blunder': return `One move cost ≥ ${props.blunderCap}% win probability.`
    case 'budget': return `You slipped ≥ ${props.budget}% across the run.`
    case 'terminal': return 'The position reached a terminal state.'
    default: return ''
  }
})

function pretty(uci: string): string {
  const m = parseUciMove(uci)
  if (!m) return uci
  return `${m.from}→${m.to}${m.promotion ? `=${m.promotion.toUpperCase()}` : ''}`
}

// Sparkline geometry: win% over the plies faced, 100% at top, 50% reference
// midline. preserveAspectRatio="none" stretches the viewBox to fill the box; the
// stroke is kept uniform with vector-effect: non-scaling-stroke (in CSS).
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
  <div class="run-summary">
    <div class="card" role="alertdialog" aria-label="Run over">
      <p :class="['headline', tone]">{{ headline }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>

      <div class="stats">
        <div class="stat">
          <span class="num">{{ n }}</span>
          <span class="lbl">plies<template v-if="isRecord"> · best 🏅</template></span>
        </div>
        <div class="stat">
          <span class="num">{{ drift.toFixed(0) }}<span class="den">/{{ budget }}</span></span>
          <span class="lbl">drift spent</span>
        </div>
        <div class="stat">
          <span class="num muted">{{ bestN }}</span>
          <span class="lbl">session best</span>
        </div>
      </div>

      <template v-if="winHistory.length">
        <svg class="spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
          <line class="mid" :x1="0" :y1="midY" :x2="W" :y2="midY" />
          <polyline :class="['line', tone]" :points="points" />
        </svg>
        <p class="spark-cap">win% across the run</p>
      </template>

      <p v-if="fatalSlip" class="fatal">
        Final move: you played <b class="you">{{ pretty(fatalSlip.played) }}</b>
        (<span class="loss">−{{ fatalSlip.loss.toFixed(1) }}%</span>) ·
        engine wanted <b class="best">{{ pretty(fatalSlip.best) }}</b>
      </p>

      <div class="controls">
        <button class="primary" @click="emit('next')">Next position →</button>
        <button @click="emit('retry')">Retry this one</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-summary {
  position: absolute;
  inset: 0;
  /* Above the chessground piece layer (pieces carry z-index up to 11). */
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.45);
  padding: 1rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
.card {
  width: 100%;
  max-width: 24rem;
  background: #fff;
  border-radius: 0.7rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  padding: 1.25rem 1.35rem 1.15rem;
}
.headline {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.headline.good {
  color: #166534;
}
.headline.bad {
  color: #b91c1c;
}
.detail {
  margin: 0.25rem 0 0;
  color: #4b5563;
  font-size: 0.92rem;
}
.stats {
  display: flex;
  gap: 1.4rem;
  margin: 1.1rem 0 0.9rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}
.num {
  font-size: 1.85rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.num.muted {
  color: #bbb;
}
.den {
  font-size: 1rem;
  font-weight: 600;
  color: #9ca3af;
}
.lbl {
  font-size: 0.74rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.spark {
  width: 100%;
  height: 3rem;
  display: block;
  background: #f8fafc;
  border-radius: 0.4rem;
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
.line.good {
  stroke: #16a34a;
}
.line.bad {
  stroke: #dc2626;
}
.spark-cap {
  margin: 0.3rem 0 0;
  text-align: center;
  font-size: 0.74rem;
  color: #9ca3af;
}
.fatal {
  margin: 0.9rem 0 0;
  padding-top: 0.8rem;
  border-top: 1px solid #f0f0f0;
  font-size: 0.86rem;
  color: #444;
}
.fatal .you {
  color: #b91c1c;
}
.fatal .best {
  color: #166534;
}
.fatal .loss {
  color: #dc2626;
  font-variant-numeric: tabular-nums;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.1rem;
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
.controls button:hover {
  border-color: #888;
}
.controls button.primary {
  background: #1a1a1a;
  color: #fff;
  border-color: #1a1a1a;
}
.controls button.primary:hover {
  background: #000;
}
</style>
