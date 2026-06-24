// Pure verdict logic for the continuation explorer — "play it on" from where a run ended
// to see if you'd actually hold the position going forward. The continuation reuses the
// run's drift machinery (lib/scoring): you play a few more moves, each scored loss-vs-best,
// and it ends with one of these outcomes. No Vue, no engine here so vitest can pin it.
// Unlike the refutation explorer it shows NO candidate moves — it's a live test of your
// own play, so the no-hints rule means you get a verdict, never a better move.

import type { RunStatus } from '~/lib/scoring'
import type { Color } from 'chessground/types'

export type ContinuationOutcome =
  | 'held' // survived the whole continuation within budget — you had it
  | 'converted' // you delivered mate
  | 'drawn' // the line ended level (stalemate / draw)
  | 'slipped' // a single move blew past the blunder cap
  | 'busted' // cumulative drift spent — you bled it away
  | 'collapsed' // you got mated

/**
 * Map the continuation's final run status (+ who, if anyone, delivered mate) to an outcome.
 * `winner` is the side that gave checkmate, or null for a non-mate ending; `humanColor` is
 * the side the player is steering. Only meaningful once the continuation has ended.
 */
export function continuationOutcome(
  status: RunStatus,
  winner: Color | null,
  humanColor: Color,
): ContinuationOutcome {
  switch (status) {
    case 'blunder':
      return 'slipped'
    case 'budget':
      return 'busted'
    case 'terminal':
      if (winner === humanColor) return 'converted'
      if (winner) return 'collapsed'
      return 'drawn'
    case 'max-n':
    default:
      return 'held'
  }
}

export interface ContinuationVerdict {
  headline: string
  tone: 'good' | 'bad' | 'neutral'
  detail: string
}

/** The outcome as a toned headline + one-line read. `steps` = how far the continuation ran. */
export function continuationVerdict(outcome: ContinuationOutcome, steps: number): ContinuationVerdict {
  switch (outcome) {
    case 'held':
      return {
        headline: 'You had it ✓',
        tone: 'good',
        detail: `Held your ground ${steps} more moves — that one was yours.`,
      }
    case 'converted':
      return { headline: 'Converted ✓', tone: 'good', detail: 'You finished it off. Never in doubt.' }
    case 'drawn':
      return { headline: 'Held the draw', tone: 'neutral', detail: 'Level to the end — no ground given up.' }
    case 'slipped':
      return {
        headline: 'It slipped',
        tone: 'bad',
        detail: 'One loose move and it was gone — trickier going forward than it looked.',
      }
    case 'busted':
      return {
        headline: 'It got away',
        tone: 'bad',
        detail: 'You bled too much win% playing it on — not quite yours yet.',
      }
    case 'collapsed':
      return { headline: 'It collapsed', tone: 'bad', detail: 'Mated. That needed more than you had this time.' }
  }
}
