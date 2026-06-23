<script setup lang="ts">
// Collapsible sidebar settings: the run tunables (search work, drift-per-move, the
// clean-runs-to-climb and busts-to-drop thresholds, blunder cap) and the eval-range
// filter. Bound straight to the shared reactive settings (useSettings), so every
// change persists to localStorage via that composable. Changes take effect on the
// NEXT run — ChessTrainer snapshots the settings + level when a run starts, so a mid-run
// tweak can't skew an in-flight comparison. Sliders are clamped to lib/settings' bounds;
// the eval filter is two bucket dropdowns written as a cp range.
import { SETTINGS_BOUNDS } from '~/lib/settings'
import {
  BUCKET_KEYS,
  BUCKET_LABELS,
  bucketsToRange,
  rangeToBuckets,
  type Bucket,
} from '~/lib/positions'

const { settings, reset } = useSettings()
const { level, reset: resetLadder } = useLadder()
const open = ref(false)
const bounds = SETTINGS_BOUNDS

// The cumulative drift budget the current level resolves to (per-move × level), using
// the same rounding ChessTrainer applies — so this note matches the live drift gauge.
const budgetThisLevel = computed(() => Math.max(1, Math.round(settings.driftPerMove * level.value)))

// The eval filter as two ordered bucket dropdowns. Picking a `from` past the
// current `to` (or vice versa) drags the other end along, so the pair stays valid.
const fromBucket = computed<Bucket>({
  get: () => rangeToBuckets(settings.evalRange).from,
  set: (val) => {
    const { to } = rangeToBuckets(settings.evalRange)
    const hi = BUCKET_KEYS.indexOf(val) > BUCKET_KEYS.indexOf(to) ? val : to
    settings.evalRange = bucketsToRange(val, hi)
  },
})
const toBucket = computed<Bucket>({
  get: () => rangeToBuckets(settings.evalRange).to,
  set: (val) => {
    const { from } = rangeToBuckets(settings.evalRange)
    const lo = BUCKET_KEYS.indexOf(val) < BUCKET_KEYS.indexOf(from) ? val : from
    settings.evalRange = bucketsToRange(lo, val)
  },
})
const filtered = computed(() => settings.evalRange !== null)

/** 800000 → "800k", 1500000 → "1.5M". */
function fmtNodes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(n / 1000)}k`
}
</script>

<template>
  <section class="settings">
    <button class="head" :aria-expanded="open" @click="open = !open">
      <span class="title">⚙ Settings</span>
      <span v-if="filtered" class="tag">filtered</span>
      <span class="chev" :class="{ open }">▾</span>
    </button>

    <div v-show="open" class="body">
      <label class="row">
        <span class="k">Search</span>
        <input
          type="range"
          :min="bounds.nodes.min"
          :max="bounds.nodes.max"
          :step="bounds.nodes.step"
          v-model.number="settings.nodes"
        >
        <span class="v">{{ fmtNodes(settings.nodes) }}</span>
      </label>

      <label class="row">
        <span class="k">Drift / move</span>
        <input
          type="range"
          :min="bounds.driftPerMove.min"
          :max="bounds.driftPerMove.max"
          :step="bounds.driftPerMove.step"
          v-model.number="settings.driftPerMove"
        >
        <span class="v">{{ settings.driftPerMove.toFixed(1) }}</span>
      </label>

      <label class="row">
        <span class="k">Climb after</span>
        <input
          type="range"
          :min="bounds.winsToAdvance.min"
          :max="bounds.winsToAdvance.max"
          :step="bounds.winsToAdvance.step"
          v-model.number="settings.winsToAdvance"
        >
        <span class="v">{{ settings.winsToAdvance }}×</span>
      </label>

      <label class="row">
        <span class="k">Drop after</span>
        <input
          type="range"
          :min="bounds.lossesToDemote.min"
          :max="bounds.lossesToDemote.max"
          :step="bounds.lossesToDemote.step"
          v-model.number="settings.lossesToDemote"
        >
        <span class="v">{{ settings.lossesToDemote }}×</span>
      </label>

      <label class="row">
        <span class="k">Blunder cap</span>
        <input
          type="range"
          :min="bounds.blunderCap.min"
          :max="bounds.blunderCap.max"
          :step="bounds.blunderCap.step"
          v-model.number="settings.blunderCap"
        >
        <span class="v">{{ settings.blunderCap }}</span>
      </label>

      <div class="row range">
        <span class="k">Eval range</span>
        <div class="selects">
          <select v-model="fromBucket" aria-label="From bucket">
            <option v-for="key in BUCKET_KEYS" :key="key" :value="key">{{ BUCKET_LABELS[key] }}</option>
          </select>
          <span class="dash">→</span>
          <select v-model="toBucket" aria-label="To bucket">
            <option v-for="key in BUCKET_KEYS" :key="key" :value="key">{{ BUCKET_LABELS[key] }}</option>
          </select>
        </div>
      </div>

      <p class="note">
        ≈ {{ budgetThisLevel }} win%-pts over level {{ level }} · {{ settings.winsToAdvance }} clean to
        climb, {{ settings.lossesToDemote }} busts to drop · applies next run.
      </p>
      <div class="actions">
        <button class="reset" @click="reset">Reset settings</button>
        <button class="reset" @click="resetLadder" title="Back to level 1">Reset ladder</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings {
  border-radius: 12px;
  background: linear-gradient(160deg, var(--surface-2), var(--surface) 60%, var(--bg-sunken));
  border: 1px solid var(--hairline);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 10px 30px -14px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}
.head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border: 0;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 1.2rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text);
  background: transparent;
  transition: color 0.15s ease;
}
.head:hover {
  color: var(--neon-cyan);
}
.title {
  flex: 1;
  text-align: left;
}
.tag {
  font-family: var(--font-body);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-on-neon);
  background: var(--neon-cyan);
  padding: 0.12rem 0.42rem;
  border-radius: 4px;
}
.chev {
  color: var(--text-muted);
  transition: transform 0.18s ease;
}
.chev.open {
  transform: rotate(180deg);
}
.body {
  padding: 0.45rem 0.9rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  border-top: 1px solid var(--hairline);
}
.row {
  display: grid;
  grid-template-columns: 5.4rem 1fr 2.4rem;
  align-items: center;
  gap: 0.55rem;
}
.k {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.row input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  background: transparent;
  cursor: pointer;
}
.row input[type='range']::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 4px;
  background: var(--bg-sunken);
  border: 1px solid var(--hairline);
}
.row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  margin-top: -6px;
  border-radius: 50%;
  background: var(--neon-cyan);
  box-shadow: 0 0 8px rgba(33, 243, 255, 0.75);
}
.row input[type='range']::-moz-range-track {
  height: 5px;
  border-radius: 4px;
  background: var(--bg-sunken);
  border: 1px solid var(--hairline);
}
.row input[type='range']::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border: 0;
  border-radius: 50%;
  background: var(--neon-cyan);
  box-shadow: 0 0 8px rgba(33, 243, 255, 0.75);
}
.v {
  font-family: var(--font-display);
  font-size: 1.05rem;
  text-align: right;
  color: var(--neon-cyan);
  font-variant-numeric: tabular-nums;
}
.range {
  grid-template-columns: 5.4rem 1fr;
}
.selects {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.selects select {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 0.78rem;
  padding: 0.28rem 0.3rem;
  color: var(--text);
  background: var(--bg-sunken);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}
.dash {
  color: var(--text-dim);
}
.note {
  margin: 0.1rem 0 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.45;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.reset {
  font-family: var(--font-display);
  font-size: 0.92rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 7px;
  padding: 0.32rem 0.7rem;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.reset:hover {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
}
</style>
