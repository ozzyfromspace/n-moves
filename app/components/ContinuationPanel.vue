<script setup lang="ts">
// The continuation explorer's panel — shown BELOW the board (in place of the run summary)
// while you "play it on". The board becomes interactive again; this panel narrates it and,
// at the end, delivers the verdict. Crucially it shows NO candidate moves, arrows or evals:
// this is a live test of your own play, so the no-hints rule holds — you get a running drift
// gauge (your standing, never a move) and a final verdict, but never a better move. Pure
// presentation; all state arrives from ChessTrainer (useContinuation).
import { continuationVerdict, type ContinuationOutcome } from '~/lib/continuation'
import type { ContinuationPhase } from '~/composables/useContinuation'

const props = defineProps<{
  phase: ContinuationPhase
  /** The verdict once ended; null while still playing. */
  outcome: ContinuationOutcome | null
  /** Cumulative win% lost vs best over the continuation. */
  drift: number
  /** The continuation's drift budget (driftPerMove × steps). */
  budget: number
  playerMoves: number
  maxPlayerMoves: number
  thinking: boolean
}>()

const emit = defineEmits<{ restart: []; done: [] }>()

const verdict = computed(() => (props.outcome ? continuationVerdict(props.outcome, props.maxPlayerMoves) : null))
// Neon frame: a calm cyan while you play, then the verdict's tone once it's in.
const frameTone = computed(() => (props.phase === 'done' ? (verdict.value?.tone ?? 'neutral') : 'play'))
</script>

<template>
  <section class="continuation" aria-label="Continuation">
    <div :class="['card-frame', frameTone]">
      <div class="card">
        <header class="top">
          <p class="title">Play it on</p>
          <span class="counter tnum">move {{ Math.min(playerMoves + (phase === 'player' ? 1 : 0), maxPlayerMoves) }} / {{ maxPlayerMoves }}</span>
        </header>

        <!-- Engine's turn -->
        <p v-if="phase === 'engine'" class="state"><span class="spinner" />The engine answers…</p>

        <!-- Scoring your move -->
        <p v-else-if="phase === 'scoring'" class="state"><span class="spinner" />Reading your move…</p>

        <!-- Your turn: no hints — just hold it together. -->
        <template v-else-if="phase === 'player'">
          <p class="lead">Your move — hold it together. No arrows, no tips: play it like you mean to keep it.</p>
          <div class="gauge">
            <span class="gauge-k">drift</span>
            <span class="gauge-v tnum" :class="{ hot: drift > budget * 0.66 }">{{ drift.toFixed(0) }}<span class="den">/{{ budget }}</span></span>
          </div>
        </template>

        <!-- Verdict -->
        <template v-else>
          <p :class="['verdict', verdict?.tone]">{{ verdict?.headline }}</p>
          <p class="verdict-sub">{{ verdict?.detail }}</p>
          <div class="gauge done">
            <span class="gauge-k">drift</span>
            <span class="gauge-v tnum">{{ drift.toFixed(0) }}<span class="den">/{{ budget }}</span></span>
            <span class="gauge-cap">over {{ playerMoves }} {{ playerMoves === 1 ? 'move' : 'moves' }}</span>
          </div>
        </template>

        <footer class="ctrls">
          <button type="button" class="nm-btn ghost" @click="emit('restart')">↺ Restart</button>
          <button type="button" class="nm-btn" @click="emit('done')">Back to challenge</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.continuation {
  margin-top: 1rem;
  filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.45));
}
.card-frame {
  --c: 16px;
  padding: 2px;
  clip-path: polygon(
    0 0,
    calc(100% - var(--c)) 0,
    100% var(--c),
    100% 100%,
    var(--c) 100%,
    0 calc(100% - var(--c))
  );
  background: linear-gradient(135deg, var(--hairline), var(--text-dim));
}
.card-frame.play {
  background: linear-gradient(135deg, var(--neon-cyan), var(--neon-violet));
}
.card-frame.good {
  background: linear-gradient(135deg, var(--good), var(--neon-cyan));
}
.card-frame.bad {
  background: linear-gradient(135deg, var(--neon-magenta), var(--bad));
}
.card-frame.neutral {
  background: linear-gradient(135deg, var(--hairline), var(--text-dim));
}
.card {
  --c: 15px;
  clip-path: polygon(
    0 0,
    calc(100% - var(--c)) 0,
    100% var(--c),
    100% 100%,
    var(--c) 100%,
    0 calc(100% - var(--c))
  );
  background: linear-gradient(160deg, var(--surface-2), var(--surface) 58%, var(--bg-sunken));
  padding: 1rem 1.2rem 1.1rem;
}
.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.4rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--neon-cyan);
}
.counter {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.lead {
  margin: 0.5rem 0 0.7rem;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.7rem 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.gauge {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.gauge-k {
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.gauge-v {
  font-family: var(--font-display);
  font-size: 1.6rem;
  line-height: 1;
  color: var(--text);
}
.gauge-v.hot {
  color: var(--bad);
}
.gauge .den {
  font-size: 0.9rem;
  color: var(--text-dim);
}
.gauge.done {
  margin-top: 0.7rem;
}
.gauge-cap {
  font-size: 0.72rem;
  color: var(--text-dim);
}
.verdict {
  margin: 0.4rem 0 0;
  font-family: var(--font-display);
  font-size: 2rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
}
.verdict.good {
  color: var(--good);
  text-shadow: 0 0 18px rgba(43, 255, 136, 0.45);
}
.verdict.bad {
  color: var(--bad);
  text-shadow: 0 0 18px rgba(255, 59, 92, 0.4);
}
.verdict.neutral {
  color: var(--text-muted);
}
.verdict-sub {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.ctrls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1rem;
}
.ctrls .nm-btn {
  flex: 1 1 auto;
  font-size: 1rem;
  padding: 0.5em 1.1em;
}
.spinner {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid rgba(33, 243, 255, 0.25);
  border-top-color: var(--neon-cyan);
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.7s linear infinite;
  flex: 0 0 auto;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
</style>
