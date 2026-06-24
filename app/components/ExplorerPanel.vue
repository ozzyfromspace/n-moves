<script setup lang="ts">
// The refutation explorer's panel — shown BELOW the board (in place of the run summary)
// while the post-mortem is open. The board itself becomes interactive again; this panel
// drives it: it lists the engine's top tries with their evals on the player's turn (click
// to play, or drag any move on the board), narrates the engine's replies, and ends with
// "you've seen enough". Pure presentation + intent: all state arrives as props from
// ChessTrainer (useExplorer); clicks/Reset/Done go back up as events. It never shows the
// move that should've been played — only how the losing lines lose.
import type { TerminalReason } from '~/composables/useChessGame'
import { formatEval, type ExplorerCandidate } from '~/lib/explorer'
import type { ExplorerEnding, ExplorerPhase } from '~/composables/useExplorer'

const props = defineProps<{
  phase: ExplorerPhase
  ending: ExplorerEnding
  candidates: ExplorerCandidate[]
  playerMoves: number
  maxPlayerMoves: number
  thinking: boolean
  /** The explorer board's terminal reason, for a precise end message. */
  terminal: TerminalReason | null
}>()

const emit = defineEmits<{ pick: [uci: string]; restart: []; done: [] }>()

// During an engine turn: the entry punishment reads differently from a mid-line counter.
const engineLine = computed(() =>
  props.playerMoves === 0 ? 'The engine plays the punishment…' : 'The engine strikes back…',
)

const doneHead = computed(() => {
  if (props.ending === 'terminal') return props.terminal === 'checkmate' ? 'Checkmate.' : 'End of the line.'
  if (props.ending === 'error') return 'Lost the thread.'
  return "You've seen enough."
})
const doneSub = computed(() => {
  if (props.ending === 'terminal') {
    return props.terminal === 'checkmate'
      ? 'That move walked into mate. Restart to try another route, or head back to the challenge and find the move that avoids all this.'
      : 'The line peters out here. Restart to try another route, or head back to the challenge.'
  }
  if (props.ending === 'error') return "Couldn't read the line just now. Restart to try again, or head back to the challenge."
  return 'Every path bleeds out the same way — that’s the point. Restart to try another, or head back to the challenge and find the move that avoids it.'
})

// Eval badge colour: the more lost the line, the redder. Least-bad sits near muted.
function badgeStyle(c: ExplorerCandidate): Record<string, string> {
  const t = Math.max(0, Math.min(1, (50 - c.winProb) / 50)) // 0 at ≥50% → 1 at 0%
  const strength = 28 + Math.round(t * 72)
  return { color: `color-mix(in srgb, var(--bad) ${strength}%, var(--text-muted))` }
}
</script>

<template>
  <section class="explorer" aria-label="Refutation explorer">
    <div class="card-frame">
      <div class="card">
        <header class="top">
          <p class="title">Refutation explorer</p>
          <span class="counter tnum">move {{ Math.min(playerMoves + (phase === 'player' ? 1 : 0), maxPlayerMoves) }} / {{ maxPlayerMoves }}</span>
        </header>

        <!-- Engine's turn: the punishment / a counter-blow lands. -->
        <p v-if="phase === 'engine'" class="state">
          <span class="spinner" />{{ engineLine }}
        </p>

        <!-- Player's turn: pick a try, or drag any move on the board. -->
        <template v-else-if="phase === 'player'">
          <p class="lead">Every path loses — even the best try. Pick one and watch it fall apart, or drag any move.</p>
          <ul v-if="candidates.length" class="cands">
            <li v-for="c in candidates" :key="c.uci">
              <button type="button" class="cand" :class="{ best: c.best }" @click="emit('pick', c.uci)">
                <span class="san">{{ c.san }}</span>
                <span v-if="c.best" class="best-tag">best try</span>
                <span class="eval tnum" :style="badgeStyle(c)">{{ formatEval(c) }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="state"><span class="spinner" />reading the lines…</p>
        </template>

        <!-- Done: you've seen enough / mate / end. -->
        <template v-else>
          <p class="done-head">{{ doneHead }}</p>
          <p class="done-sub">{{ doneSub }}</p>
        </template>

        <footer class="ctrls">
          <button type="button" class="nm-btn ghost" @click="emit('restart')">↺ Restart explorer</button>
          <button type="button" class="nm-btn" @click="emit('done')">Back to challenge</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.explorer {
  margin-top: 1rem;
  filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.45));
}
/* Same neon frame idiom as the run summary, fixed to the "bad" (refutation) tone. */
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
  background: linear-gradient(135deg, var(--neon-magenta), var(--bad));
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
  color: var(--bad);
  text-shadow: 0 0 16px rgba(255, 59, 92, 0.35);
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
.cands {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.cand {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--hairline);
  border-radius: 9px;
  background: var(--bg-sunken);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.1s ease;
}
.cand:hover {
  border-color: var(--neon-cyan);
  background: color-mix(in srgb, var(--neon-cyan) 8%, var(--bg-sunken));
}
.cand:active {
  transform: translateY(1px);
}
.cand.best {
  border-color: color-mix(in srgb, var(--neon-cyan) 45%, var(--hairline));
}
.cand:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 2px;
}
.san {
  font-size: 1.35rem;
  line-height: 1;
  color: var(--text);
  word-spacing: 0.1em;
}
.best-tag {
  font-family: var(--font-body);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-on-neon);
  background: var(--neon-cyan);
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
}
.eval {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 1.25rem;
  letter-spacing: 0.02em;
  font-weight: 700;
}
.done-head {
  margin: 0.5rem 0 0;
  font-family: var(--font-display);
  font-size: 1.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
  color: var(--text);
}
.done-sub {
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
