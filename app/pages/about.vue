<script setup lang="ts">
// The "why this exists" page: the premise, the experiment, and how the scoring
// works — in plain terms. Pure content; styling leans on the global manga theme
// tokens (theme.css) so it harmonises with the rest of the app.
useHead({
  title: 'n-moves — the experiment',
  meta: [
    {
      name: 'description',
      content:
        'Why n-moves exists: training chess intuition by feel, not theory — play like the computer.',
    },
  ],
})
</script>

<template>
  <article class="about">
    <header class="hero">
      <p class="kicker">The experiment</p>
      <h1 class="title">Play like the<br><span class="accent nm-holo">computer.</span></h1>
      <p class="lede">
        n-moves is a chess trainer built on one inversion:
        <b>don't try to win — try not to lose ground.</b>
      </p>
    </header>

    <section class="block">
      <h2><span class="num">01</span> The premise</h2>
      <p>
        You're dropped into a real position and you play against objective Stockfish — the strongest
        judge there is. Your only job is to <b>deviate as little as possible from its choices</b>:
        to hold the evaluation, move after move, for as many of <i>your</i> moves as you can.
      </p>
      <p class="dim">You're not playing for checkmate. You're playing to not drift.</p>
    </section>

    <section class="block">
      <h2><span class="num">02</span> The bet</h2>
      <p>
        Most chess training is <b>theory</b>: openings to memorise, tactical motifs to drill,
        principles to recite. n-moves throws that out and asks a different question —
      </p>
      <blockquote>
        Can you train chess intuition the way you'd train a neural network? Pure, high-volume
        exposure to <i>what the best move feels like</i>, with a tight, honest, reproducible feedback
        signal — and no theory at all.
      </blockquote>
      <p>
        No lectures. No named openings. Just rep after rep of trying to feel the engine's move, and a
        number that tells you how close you got.
      </p>
    </section>

    <section class="block">
      <h2><span class="num">03</span> Why it never shows you the move</h2>
      <p>
        The engine <b>never</b> reveals its choice — not while you play, not when a run ends. If it
        did, you'd copy it and learn nothing. The whole point is to build the instinct yourself: to
        look at a position and <i>feel</i> where the evaluation wants to go. The only feedback is how
        your odds moved and how much ground you've ceded.
      </p>
    </section>

    <section class="block">
      <h2><span class="num">04</span> How it works</h2>
      <div class="cards">
        <div class="card nm-panel">
          <h3>Drift</h3>
          <p>
            Every move, you lose a sliver of win probability versus the engine's best. You can't beat
            perfect play, so it's never negative. That accumulated loss is your <b>drift</b> — a
            mistake budget. Spend it all and the run is over.
          </p>
        </div>
        <div class="card nm-panel">
          <h3>Levels</h3>
          <p>
            Level 1 is one strong move. String together a few clean runs in a row and you
            <b>climb</b>: level 2 is two strong moves back to back, level 3 is three, and up it goes.
            Cold streak? You drop back down. The ladder hunts for your edge and leans on it.
          </p>
        </div>
        <div class="card nm-panel">
          <h3>The signal</h3>
          <p>
            Your chances, your drift, the level you're holding — that's the whole dashboard. It's
            <b>reproducible</b> because the engine is deterministic: same position, same search, same
            verdict, every single time.
          </p>
        </div>
      </div>
    </section>

    <section class="block">
      <h2><span class="num">05</span> What winning looks like</h2>
      <p>
        There's no final boss. <b>Winning is your level creeping up</b> over weeks — proof the
        instinct is generalising, that you can sit at the board and, more and more often, just feel
        the move the machine would make.
      </p>
      <p class="dim">It's an experiment, and you're the subject. Let's find out.</p>
    </section>

    <NuxtLink to="/" class="nm-btn cta">▶ Start training</NuxtLink>
  </article>
</template>

<style scoped>
.about {
  max-width: 46rem;
  margin: 0 auto;
  padding: 3rem 1.5rem 5rem;
  line-height: 1.62;
}
.hero {
  margin-bottom: 3.2rem;
}
.kicker {
  margin: 0 0 0.6rem;
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--neon-cyan);
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(3.4rem, 12vw, 7rem);
  line-height: 0.9;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.title .accent {
  display: inline-block;
  filter: drop-shadow(0 0 22px rgba(33, 243, 255, 0.45));
}
.lede {
  margin: 1.5rem 0 0;
  font-size: 1.3rem;
  color: var(--text);
}
.lede b {
  color: var(--neon-magenta);
}
.block {
  margin: 2.6rem 0;
}
.block h2 {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  margin: 0 0 0.8rem;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.num {
  font-size: 1.1rem;
  color: var(--neon-cyan);
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}
.block p {
  margin: 0 0 0.9rem;
  font-size: 1.05rem;
  color: var(--text);
}
.block b {
  color: var(--text);
  font-weight: 700;
}
.block i {
  color: var(--neon-cyan);
  font-style: italic;
}
.dim {
  color: var(--text-muted);
}
blockquote {
  margin: 1.3rem 0;
  padding: 1rem 1.3rem;
  border-left: 3px solid var(--neon-magenta);
  background: var(--surface);
  border-radius: 0 0.5rem 0.5rem 0;
  font-size: 1.18rem;
  font-style: italic;
  color: var(--text);
}
blockquote i {
  color: var(--neon-magenta);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 1rem;
  margin-top: 1.2rem;
}
.card {
  padding: 1.15rem 1.25rem;
}
.card h3 {
  margin: 0 0 0.5rem;
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--neon-cyan);
}
.card p {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text-muted);
  line-height: 1.55;
}
.cta {
  margin-top: 2.2rem;
  font-size: 1.25rem;
}
@media (max-width: 36rem) {
  .about {
    padding: 2rem 1.1rem 4rem;
  }
  .block h2 {
    font-size: 1.7rem;
  }
}
</style>
