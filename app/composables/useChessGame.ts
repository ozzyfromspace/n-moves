import { Chess, type Move, type Square } from 'chess.js'
import type { Color, Dests, Key } from 'chessground/types'

// The single rules authority for a position. One chess.js instance lives here;
// everything else (BoardPanel, the scoring loop) reads its reactive projection
// and drives it through `move`. Keeping legality, SAN/FEN, and terminal
// detection in one place is the whole reason we dropped vue3-chessboard — no
// second, divergent chess.js.

export type TerminalReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move'

export interface MoveInput {
  from: string
  to: string
  /** Omit to auto-queen a promoting pawn (a real picker comes with the UX pass). */
  promotion?: string
}

function toColor(c: 'w' | 'b'): Color {
  return c === 'w' ? 'white' : 'black'
}

function computeDests(game: Chess): Dests {
  const dests: Dests = new Map()
  for (const m of game.moves({ verbose: true })) {
    const existing = dests.get(m.from)
    if (existing) existing.push(m.to)
    else dests.set(m.from, [m.to])
  }
  return dests
}

// chessground reports a pawn move to the back rank with no promotion piece, so
// fill one in before chess.js sees it. Default queen for v0.
function defaultPromotion(game: Chess, from: string, to: string): 'q' | undefined {
  const piece = game.get(from as Square)
  if (!piece || piece.type !== 'p') return undefined
  const rank = to[1]
  const promotes = (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1')
  return promotes ? 'q' : undefined
}

function terminalReason(game: Chess): TerminalReason | null {
  if (!game.isGameOver()) return null
  if (game.isCheckmate()) return 'checkmate'
  if (game.isStalemate()) return 'stalemate'
  if (game.isInsufficientMaterial()) return 'insufficient-material'
  if (game.isThreefoldRepetition()) return 'threefold-repetition'
  if (game.isDrawByFiftyMoves()) return 'fifty-move'
  return null
}

export function useChessGame(initialFen?: string) {
  const game = new Chess(initialFen)

  const fen = ref(game.fen())
  const turnColor = ref<Color>(toColor(game.turn()))
  const dests = shallowRef<Dests>(computeDests(game))
  const lastMove = ref<[Key, Key] | undefined>(undefined)
  const check = ref(game.isCheck())
  const isGameOver = ref(game.isGameOver())
  const terminal = ref<TerminalReason | null>(terminalReason(game))
  // Plies played since the last load/reset — this is `n` in the trainer.
  const moveCount = ref(0)

  // Checkmate is the only decisive end: the side to move has been mated.
  const winner = computed<Color | null>(() =>
    terminal.value === 'checkmate' ? (turnColor.value === 'white' ? 'black' : 'white') : null,
  )

  function sync(last?: [Key, Key]) {
    fen.value = game.fen()
    turnColor.value = toColor(game.turn())
    dests.value = computeDests(game)
    lastMove.value = last
    check.value = game.isCheck()
    isGameOver.value = game.isGameOver()
    terminal.value = terminalReason(game)
  }

  /** Apply a move by coordinates. Returns the Move, or null if illegal. */
  function move(input: MoveInput): Move | null {
    const promotion = input.promotion ?? defaultPromotion(game, input.from, input.to)
    let result: Move
    try {
      result = game.move({ from: input.from, to: input.to, promotion })
    } catch {
      return null // chess.js throws on an illegal move
    }
    moveCount.value++
    sync([result.from, result.to])
    return result
  }

  /** Apply a move by SAN (e.g. 'Nf3', 'e8=Q'). Returns the Move, or null if illegal. */
  function moveSan(san: string): Move | null {
    let result: Move
    try {
      result = game.move(san)
    } catch {
      return null
    }
    moveCount.value++
    sync([result.from, result.to])
    return result
  }

  /** Replace the position. Throws on an invalid FEN (chess.js behaviour). */
  function load(nextFen: string) {
    game.load(nextFen)
    moveCount.value = 0
    sync(undefined)
  }

  function reset() {
    game.reset()
    moveCount.value = 0
    sync(undefined)
  }

  // Escape hatch for the orchestrator: read SAN/PV, apply engine replies, etc.
  function raw(): Chess {
    return game
  }

  return {
    fen,
    turnColor,
    dests,
    lastMove,
    check,
    isGameOver,
    terminal,
    winner,
    moveCount,
    move,
    moveSan,
    load,
    reset,
    raw,
  }
}
