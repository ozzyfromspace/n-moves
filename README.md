# n-moves

**Play like the computer.** A chess trainer built on one inversion: _don't try to win — try not to lose ground._

You're dropped into a real position and play against objective Stockfish. Your only job is to deviate as little as possible from its choices — to hold the evaluation, move after move, for as many of your moves as you can. It's a bet that you can train chess intuition the way you'd train a neural net: high-volume exposure to _what the best move feels like_, with a tight, honest, reproducible feedback signal — and no theory at all.

The engine **never shows you its move.** Working it out yourself is the point. The full premise lives in-app at **/about**.

## How it works

- **Drift** — every move you lose a little win probability versus the engine's best (never negative — you can't beat perfect play). That accumulated loss is your _drift_: a mistake budget. Spend it all and the run ends.
- **Levels** — level 1 is one strong move. String together a few clean runs in a row and you climb; a cold streak drops you back down. The ladder hunts for your edge and leans on it.
- **The signal** — your win odds, your drift, the level you're holding. Reproducible, because the engine is deterministic: same position, same search, same verdict, every time.

## Stack

- [Nuxt 4](https://nuxt.com) SPA (`ssr: false`) — everything runs in the browser; there is no backend.
- [chessground](https://github.com/lichess-org/chessground) + [chess.js](https://github.com/jhlywa/chess.js) — board rendering and rules.
- [Stockfish 18](https://github.com/official-stockfish/Stockfish) (single-thread WASM) — the oracle _and_ the opponent.
- [idb](https://github.com/jakearchibald/idb) (IndexedDB) for run history · [vitest](https://vitest.dev) for the unit tests.

> **Why single-thread Stockfish?** The whole signal is small win% deltas, so the engine has to be _deterministic_: same FEN + same node budget → an identical evaluation, every run. Multithreaded Stockfish (Lazy SMP) is not. Determinism beats speed here.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

```bash
pnpm test         # vitest (pure scoring / positions math)
pnpm typecheck    # vue-tsc
pnpm build        # production build (Vercel preset) — see DEPLOY.md
```

## Positions

Starts are sampled offline from the [Lichess evaluations dump](https://database.lichess.org/#evals) into `public/positions/positions.json` (committed). A small `positions.sample.json` is the fallback if the full set is missing. To regenerate (the script header has the full `zstd`-CLI recipe):

```bash
curl -s -r 0-80000000 https://database.lichess.org/lichess_db_eval.jsonl.zst -o eval.zst
zstd -d -c eval.zst > eval.jsonl     # a truncation error at the tail is expected
node --experimental-strip-types scripts/build-positions.ts --source eval.jsonl --per-bucket 800
```

## License

**GPL-3.0** — see [LICENSE](./LICENSE).

n-moves bundles and ships GPL-3.0 software to the browser, so the app as a whole is GPL-3.0:

- [Stockfish](https://github.com/official-stockfish/Stockfish) — GPL-3.0 (NNUE embedded in the WASM build under `public/engine/`)
- [chessground](https://github.com/lichess-org/chessground) — GPL-3.0

It also uses [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause) and [idb](https://github.com/jakearchibald/idb) (ISC). Position data is derived from the [Lichess open database](https://database.lichess.org) (CC0).

Copyright © 2026 ozzyfromspace.

---

Vibe coded with ❤️ by **[ozzyfromspace](https://github.com/ozzyfromspace)**.
