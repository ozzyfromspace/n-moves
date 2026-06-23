# Deploying n-moves

n-moves is a **pure client-side SPA** (`ssr: false`): the Stockfish engine, the
board, scoring, settings, and history all run in the browser. There is no backend
and no shared server state. Because v0 uses the **single-thread** Stockfish build,
**no cross-origin isolation (COOP/COEP) headers are needed** — it deploys as a
plain static site.

Everything below was verified locally: `pnpm build` and `pnpm generate` both
succeed, and a static server returns the engine WASM/JS and `positions.sample.json`
with correct content types (the loader requires `application/json`).

| Asset | Status | Type |
| --- | --- | --- |
| `/` (SPA shell) | 200 | text/html |
| `/positions/positions.sample.json` | 200 | application/json |
| `/engine/stockfish-18-lite-single.js` | 200 | text/javascript |
| `/engine/stockfish-18-lite-single.wasm` | 200 | application/wasm (7.0 MB) |

---

## Path A — Vercel CLI, prebuilt (recommended for a preview)

Deploys the locally-built output directly to a preview URL. No Git remote needed.

**One-time** (interactive — in Claude Code, prefix with `!` to run in this session,
or run them in your own terminal):

```
! npx vercel login
! npx vercel link          # create/select the Vercel project for this folder
```

**Deploy a preview** (rebuilds, then ships `.vercel/output`):

```
pnpm deploy:preview        # = pnpm build && npx vercel deploy --prebuilt
```

**Promote to production** when you're happy:

```
pnpm deploy:prod           # = pnpm build && npx vercel deploy --prebuilt --prod
```

The `vercel` Nitro preset emits a Build Output API bundle whose routing serves the
SPA shell for any path via the `__fallback` function, so deep links / refreshes
work. (n-moves is single-screen at `/` anyway — `board-test` / `engine-test` are
dev harnesses.)

## Path B — Git integration (push-to-deploy)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it at <https://vercel.com/new>.

Vercel auto-detects **Nuxt** (build `nuxt build`, output `.vercel/output`) and
**pnpm** (from `pnpm-lock.yaml` + the `packageManager` field). No `vercel.json` is
required. Every branch/PR then gets an automatic **preview** deployment; `main`
publishes to production.

> Node version: Vercel's default (20/22) satisfies `engines.node >= 20`. The local
> Node 25 requirement is only for the *offline* `scripts/build-positions.ts` (native
> zstd) — it is never run during a deploy.

---

## After deploying — live smoke test

On the deployed URL:

1. The status line goes **"Booting engine…" → "Your move — play like the computer."**
   (confirms the worker + WASM loaded same-origin).
2. Play a move — the win% / drift update and the engine replies.
3. Finish a run — it lands in **Recent runs** and **best ever** updates.
4. **Reload** — best-ever + recent runs persist (IndexedDB) and settings stick
   (localStorage).

## Optional — ship the full positions set

The app ships the committed `positions.sample.json`. To deploy the full bucketed
dataset instead, run the offline builder first (writes the git-ignored
`public/positions/positions.json`, which the loader prefers over the sample):

```
pnpm build:positions       # streams the Lichess eval dump; needs local Node >= 22.15
```
