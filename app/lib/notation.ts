import { Chess } from 'chess.js'

// Move display helpers: UCI long-algebraic → SAN (needs the position to know the
// piece, captures, disambiguation), and SAN → figurine notation (piece letters as
// Unicode glyphs). Kept out of the presentation components so they stay rules-free
// — ChessTrainer converts to SAN at the position the move was made, the overlays
// apply the figurines.

// Filled (black) glyphs — legible on the light overlay cards for either side, and
// the convention printed chess uses for figurine notation regardless of color.
const FIGURINE: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
}

/**
 * UCI long-algebraic ('b1a3', 'e7e8q') → SAN ('Na3', 'e8=Q') as read from
 * position `fen`. Returns null if the move is illegal there (caller falls back to
 * the raw UCI). Uses a throwaway chess.js — pure formatting, not game state, so it
 * doesn't touch the live useChessGame instance.
 */
export function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    }).san
  } catch {
    return null
  }
}

/**
 * SAN → figurine notation: every piece letter (K/Q/R/B/N — always uppercase in
 * SAN; files are lowercase, castling is 'O') becomes its Unicode glyph, including
 * a promotion piece ('e8=Q' → 'e8=♛'). Pawn moves and castling are unchanged.
 */
export function toFigurine(san: string): string {
  return san.replace(/[KQRBN]/g, c => FIGURINE[c]!)
}

/**
 * Play `uciLine` (long-algebraic plies) from `startFen` and return the SAN for each
 * ply, stopping at the first illegal/malformed move. Used to render an engine line —
 * e.g. the refutation of a losing move (the opponent's punishing continuation) — as
 * readable notation. Pure: a throwaway chess.js, never the live game.
 */
export function uciLineToSan(startFen: string, uciLine: string[]): string[] {
  const game = new Chess(startFen)
  const out: string[] = []
  for (const uci of uciLine) {
    try {
      out.push(
        game.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.slice(4, 5) || undefined,
        }).san,
      )
    } catch {
      break
    }
  }
  return out
}
