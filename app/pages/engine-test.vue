<script setup lang="ts">
// Smoke-test harness for useEngine (build-order step 3). Proves the worker
// boots, the UCI handshake completes, analyze() returns eval + bestmove + pv,
// and the search is DETERMINISTIC — same fen + nodes ⇒ identical result twice,
// the whole reason we ship single-thread. Throwaway, like board-test.vue;
// ChessTrainer.vue wires the real loop in step 4.
import { parseUciMove, type UciMove } from '~/lib/uci'
import type { Analysis } from '~/composables/useEngine'

useHead({ title: 'n-moves — engine smoke test' })

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const SMOKE_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'

const { ready, searching, error, init, analyze, newGame } = useEngine()

const fen = ref(SMOKE_FEN)
const nodes = ref(800_000)
const log = ref<string[]>([])
const determinism = ref<{ pass: boolean; detail: string } | null>(null)

function add(msg: string) {
  log.value.unshift(msg)
  if (log.value.length > 30) log.value.length = 30
}

function fmtMove(uci: string): string {
  const m: UciMove | null = parseUciMove(uci)
  if (!m) return uci
  return `${m.from}→${m.to}${m.promotion ? `=${m.promotion.toUpperCase()}` : ''}`
}

function describe(a: Analysis): string {
  const score = a.mate !== undefined ? `#${a.mate}` : `${a.cp ?? '?'}cp`
  const pv = a.pv.slice(0, 6).map(fmtMove).join(' ')
  return `${fmtMove(a.bestmove)}  [${score}, d${a.depth ?? '?'}, ${a.nodes ?? '?'}n]  pv: ${pv}`
}

onMounted(async () => {
  add('booting engine…')
  try {
    await init()
    add('handshake ok — engine ready')
  } catch (e) {
    add(`init failed: ${(e as Error).message}`)
  }
})

async function runAnalyze() {
  determinism.value = null
  const t0 = performance.now()
  try {
    const a = await analyze(fen.value, { nodes: nodes.value })
    add(`${describe(a)}  — ${Math.round(performance.now() - t0)}ms`)
    console.log('[engine] analyze', a)
  } catch (e) {
    add(`analyze failed: ${(e as Error).message}`)
  }
}

async function checkDeterminism() {
  determinism.value = null
  try {
    await newGame()
    const a = await analyze(fen.value, { nodes: nodes.value })
    await newGame()
    const b = await analyze(fen.value, { nodes: nodes.value })
    const pass = a.bestmove === b.bestmove && a.cp === b.cp && a.mate === b.mate
    determinism.value = { pass, detail: `A: ${describe(a)}\nB: ${describe(b)}` }
    add(pass ? 'determinism PASS ✓ — identical twice' : 'determinism FAIL ✗ — results differed')
  } catch (e) {
    add(`determinism check failed: ${(e as Error).message}`)
  }
}
</script>

<template>
  <main class="harness">
    <h1>Engine smoke test</h1>

    <p class="status">
      <span :class="['dot', ready ? 'on' : 'off']" />
      {{ ready ? 'ready' : 'booting…' }}
      <span v-if="searching" class="thinking">· searching…</span>
      <span v-if="error" class="err">· {{ error }}</span>
    </p>

    <label class="field">
      <span>FEN</span>
      <textarea v-model="fen" rows="2" spellcheck="false" />
    </label>
    <div class="presets">
      <button @click="fen = START_FEN">Start position</button>
      <button @click="fen = SMOKE_FEN">Italian (smoke)</button>
    </div>

    <label class="field">
      <span>nodes</span>
      <input v-model.number="nodes" type="number" min="10000" step="50000" >
    </label>
    <div class="presets">
      <button @click="nodes = 100_000">100k</button>
      <button @click="nodes = 800_000">800k</button>
      <button @click="nodes = 1_500_000">1.5M</button>
    </div>

    <div class="actions">
      <button :disabled="!ready || searching" @click="runAnalyze">Analyze</button>
      <button :disabled="!ready || searching" @click="checkDeterminism">
        Determinism check (×2)
      </button>
    </div>

    <p
      v-if="determinism"
      :class="['verdict', determinism.pass ? 'pass' : 'fail']"
    >
      {{ determinism.pass ? 'DETERMINISTIC ✓' : 'NON-DETERMINISTIC ✗' }}
      <span class="detail">{{ determinism.detail }}</span>
    </p>

    <ol class="log">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ol>
  </main>
</template>

<style scoped>
.harness {
  max-width: 44rem;
  margin: 2rem auto;
  padding: 0 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
h1 {
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
}
.dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  display: inline-block;
}
.dot.on { background: #16a34a; }
.dot.off { background: #d1d5db; }
.thinking { color: #2563eb; }
.err { color: #dc2626; }
.field {
  display: block;
  margin: 1rem 0 0.25rem;
}
.field > span {
  display: block;
  font-size: 0.8rem;
  color: #888;
  margin-bottom: 0.25rem;
}
.field textarea,
.field input {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  box-sizing: border-box;
}
.presets,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
button {
  padding: 0.4rem 0.75rem;
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  background: #fff;
  cursor: pointer;
}
button:hover:not(:disabled) { border-color: #888; }
button:disabled { opacity: 0.5; cursor: default; }
.actions {
  margin-top: 1rem;
}
.verdict {
  margin: 1rem 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.4rem;
  font-weight: 600;
}
.verdict.pass { background: #dcfce7; color: #166534; }
.verdict.fail { background: #fee2e2; color: #991b1b; }
.verdict .detail {
  display: block;
  margin-top: 0.4rem;
  font-weight: 400;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  color: #333;
}
.log {
  margin-top: 1.5rem;
  padding-left: 1.2rem;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: #444;
  line-height: 1.5;
}
.log li {
  word-break: break-all;
}
</style>
