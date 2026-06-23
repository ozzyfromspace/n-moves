import { advanceLadder, clampLadder, initLadder, type LadderState } from '~/lib/ladder'
import type { RunStatus } from '~/lib/scoring'

// The level-ladder progress as a reactive localStorage-backed singleton (same pattern
// and ssr:false rationale as useSettings): the current level, win streak, and bust
// streak that the trainer draws each run's target from and folds every finished run
// into, and the sidebar shows. The transition arithmetic is pure in lib/ladder
// (vitest-covered); here we just add reactivity and persistence.

const STORAGE_KEY = 'n-moves:ladder'

const state = reactive<LadderState>(initLadder())

const scope = effectScope(true)
let started = false

function start(): void {
  if (started) return
  started = true

  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        Object.assign(state, clampLadder(JSON.parse(raw)))
      } catch {
        // corrupt value — keep the fresh ladder.
      }
    }
  }

  scope.run(() => {
    watch(
      state,
      () => {
        if (typeof localStorage === 'undefined') return
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {
          // storage disabled/full — progress just won't survive a reload.
        }
      },
      { deep: true },
    )
  })
}

export function useLadder() {
  start()

  const level = computed(() => state.level)
  const streak = computed(() => state.streak)
  const busts = computed(() => state.busts)

  /** Fold a finished run's status into the ladder (win/bust streaks → climb/drop). */
  function record(status: RunStatus, winsToAdvance: number, lossesToDemote: number): void {
    Object.assign(state, advanceLadder(state, status, winsToAdvance, lossesToDemote))
  }

  /** Restart the climb from level 1 (fresh ladder). */
  function reset(): void {
    Object.assign(state, initLadder())
  }

  return { level, streak, busts, record, reset }
}
