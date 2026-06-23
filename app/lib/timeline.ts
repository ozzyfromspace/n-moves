import { Chess } from 'chess.js'

// Replays a run's recorded plies into a list of board snapshots — the backbone of
// the in-run move scrubber (←/→). Pure: a throwaway chess.js walks the moves and
// emits one frame per position, so vitest covers it without Vue or chessground.
// It carries NO eval and NO engine best move — scrubbing only ever re-shows the
// player's own moves and the engine replies already on the board, never a hint.
//
// Frame 0 is the start position (no lastMove); frame i (i ≥ 1) is the position
// after the i-th ply. A malformed/illegal move stops the walk early and returns
// the frames built so far, so a corrupt snapshot degrades to "scrub what we could
// rebuild" instead of throwing.

/** One position along a run: enough for BoardPanel to render it read-only. */
export interface TimelineFrame {
  /** Full FEN at this point. */
  fen: string
  /** Side to move here (board keeps the player's orientation regardless). */
  turnColor: 'white' | 'black'
  /** The move that produced this frame, as [from, to]; absent on the start frame. */
  lastMove?: [string, string]
  /** Whether the side to move is in check (drives the check highlight). */
  check: boolean
}

const colorOf = (game: Chess): 'white' | 'black' => (game.turn() === 'w' ? 'white' : 'black')

/**
 * Build the per-ply board snapshots for `moves` (long-algebraic UCI) played from
 * `startFen`. Always returns at least the start frame. Stops early — returning the
 * frames accumulated so far — if a move is illegal in its position.
 */
export function buildTimeline(startFen: string, moves: string[]): TimelineFrame[] {
  const game = new Chess(startFen)
  const frames: TimelineFrame[] = [
    { fen: game.fen(), turnColor: colorOf(game), check: game.isCheck() },
  ]
  for (const uci of moves) {
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci.slice(4, 5) || undefined
    try {
      game.move({ from, to, promotion })
    } catch {
      break // illegal/malformed ply — return the timeline rebuilt up to here
    }
    frames.push({
      fen: game.fen(),
      turnColor: colorOf(game),
      lastMove: [from, to],
      check: game.isCheck(),
    })
  }
  return frames
}
