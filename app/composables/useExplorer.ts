import { parseUciMove } from '~/lib/uci'
import { buildCandidates, type ExplorerCandidate } from '~/lib/explorer'
import type { Analysis, MultiLine } from '~/composables/useEngine'

// The interactive refutation explorer: a self-contained post-mortem the player opens
// AFTER a committed blunder. It starts at the position the blunder led to (engine to
// move), lets the engine land its punishing reply, then — on each of the player's turns —
// surfaces the engine's top tries and lets the player click one or drag any move; the
// engine answers with its best and the loop rolls on for a few moves, until mate or the
// move cap. It NEVER reveals the move that should have been played at the original
// position: it opens one ply past that choice and only ever shows how losing lines lose.
//
// It owns its OWN board (a second useChessGame) so the live run is untouched, but borrows
// the ONE Stockfish worker through injected functions — no second engine, no duplicate TT.
// Nothing here is persisted: a refresh resumes the run summary, not the explorer.

/** Fallback depth (player moves) when none is passed; the setting overrides it at entry. */
const DEFAULT_MAX_PLAYER_MOVES = 4
/** How many tries to surface on each of the player's turns. */
const LINES = 3
/** A beat so the engine's reply reads as a blow landing, not an instant teleport. */
const ENGINE_REPLY_DELAY_MS = 350

export type ExplorerPhase = 'engine' | 'player' | 'done'
/** Why the post-mortem stopped: hit the move cap, the board ended, or the engine failed. */
export type ExplorerEnding = 'enough' | 'terminal' | 'error' | null

export interface ExplorerDeps {
  /** Top-`count` ranked lines at a position (MultiPV), player-perspective at the player's turn. */
  analyzeLines: (fen: string, count: number) => Promise<MultiLine[]>
  /** Single best-move search — the engine's punishing/crushing reply. */
  searchBest: (fen: string) => Promise<Analysis>
  /** Cancel an in-flight engine search (on exit). */
  stop: () => void
}

export function useExplorer(deps: ExplorerDeps) {
  const { fen, turnColor, dests, lastMove, check, terminal, move, load } = useChessGame()

  const active = ref(false)
  const phase = ref<ExplorerPhase>('engine')
  const ending = ref<ExplorerEnding>(null)
  const candidates = ref<ExplorerCandidate[]>([])
  const playerMoves = ref(0)
  /** How far this post-mortem runs (player moves) — set from the setting at entry. */
  const maxPlayerMoves = ref(DEFAULT_MAX_PLAYER_MOVES)
  /** True while an engine search is in flight (entry punishment, a reply, or the tries). */
  const thinking = ref(false)

  let rootFen = '' // the position after the blunder — Reset returns here
  // Cache each shown try's PV so picking a suggested line replies instantly (pv[1] is the
  // engine's best answer to it); a free-dragged move falls through to a fresh search.
  let replyByMove = new Map<string, string[]>()
  // Bumped on enter/restart/exit to invalidate any in-flight async continuation.
  let token = 0

  function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function finish(reason: ExplorerEnding): void {
    phase.value = 'done'
    ending.value = reason
    candidates.value = []
    thinking.value = false
  }

  /** Apply a long-algebraic move to the explorer board; true if it took. */
  function applyUci(uci: string): boolean {
    const m = parseUciMove(uci)
    if (!m) return false
    return move({ from: m.from, to: m.to, promotion: m.promotion }) !== null
  }

  /** The engine plays its best (a crushing reply) at the current position, then hands over. */
  async function runEngine(my: number): Promise<void> {
    phase.value = 'engine'
    candidates.value = []
    thinking.value = true
    let best: Analysis
    try {
      best = await deps.searchBest(fen.value)
    } catch {
      if (my === token) finish('error')
      return
    } finally {
      if (my === token) thinking.value = false
    }
    if (my !== token) return
    applyUci(best.bestmove)
    if (terminal.value) return finish('terminal')
    await offerTries(my)
  }

  /** Player to move: search the top tries and show them — or stop if we've shown enough. */
  async function offerTries(my: number): Promise<void> {
    if (playerMoves.value >= maxPlayerMoves.value) return finish('enough')
    phase.value = 'player'
    candidates.value = []
    thinking.value = true
    let lines: MultiLine[]
    try {
      lines = await deps.analyzeLines(fen.value, LINES)
    } catch {
      if (my === token) finish('error')
      return
    } finally {
      if (my === token) thinking.value = false
    }
    if (my !== token) return
    replyByMove = new Map(lines.map(l => [l.move, l.pv]))
    candidates.value = buildCandidates(fen.value, lines)
    if (candidates.value.length === 0) finish('terminal') // no legal try (shouldn't happen)
  }

  /** The player commits a try — a clicked candidate or a dragged move (uci = orig+dest). */
  async function play(uci: string): Promise<void> {
    if (!active.value || phase.value !== 'player') return
    const my = token
    if (!applyUci(uci)) return // illegal — chessground snaps the piece back
    playerMoves.value++
    candidates.value = []

    if (terminal.value) return finish('terminal') // player delivered mate/stalemate (rare)

    // Instant reply when they took a suggested line (we already have the engine's answer);
    // a free-dragged move has no cached PV, so fall through to a fresh best-move search.
    const reply = replyByMove.get(uci)?.[1]
    if (!reply) return runEngine(my)

    phase.value = 'engine'
    await delay(ENGINE_REPLY_DELAY_MS)
    if (my !== token) return
    if (!applyUci(reply)) return runEngine(my) // cached reply somehow illegal — search instead
    if (terminal.value) return finish('terminal')
    await offerTries(my)
  }

  /** Open the explorer at the position the blunder led to (engine to move). `maxMoves`
   *  caps how many of the player's moves it plays out (the explorer-depth setting). */
  async function enter(blunderFen: string, maxMoves?: number): Promise<void> {
    const my = ++token
    rootFen = blunderFen
    maxPlayerMoves.value = Math.max(1, Math.round(maxMoves ?? DEFAULT_MAX_PLAYER_MOVES))
    active.value = true
    ending.value = null
    candidates.value = []
    playerMoves.value = 0
    replyByMove = new Map()
    load(blunderFen)
    await runEngine(my)
  }

  /** Back to the blunder — replay the punishment from scratch. */
  async function restart(): Promise<void> {
    if (!active.value) return
    const my = ++token
    deps.stop()
    ending.value = null
    candidates.value = []
    playerMoves.value = 0
    replyByMove = new Map()
    load(rootFen)
    await runEngine(my)
  }

  /** Leave the explorer; the run summary takes the board back. */
  function exit(): void {
    token++ // invalidate any in-flight search/continuation
    deps.stop()
    active.value = false
    phase.value = 'engine'
    ending.value = null
    candidates.value = []
    thinking.value = false
  }

  // Invalidate any pending continuation if the owning component unmounts mid-search.
  onScopeDispose(() => {
    token++
  })

  return {
    // board projection (fed to the shared BoardPanel while exploring)
    fen,
    turnColor,
    dests,
    lastMove,
    check,
    terminal,
    // state
    active,
    phase,
    ending,
    candidates,
    playerMoves,
    thinking,
    maxPlayerMoves,
    // actions
    enter,
    restart,
    exit,
    play,
  }
}
