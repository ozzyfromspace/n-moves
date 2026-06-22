<script setup lang="ts">
// Training screen — scaffold placeholder. The board (chessground), engine
// (Stockfish worker), and the drift-budget scoring loop are wired in the
// next build steps.
useHead({
  title: 'n-moves',
  meta: [{ name: 'description', content: 'Play like the computer — minimise your eval drift from Stockfish.' }],
})
</script>

<template>
  <main class="trainer">
    <h1>n-moves</h1>
    <p class="tagline">
      Don't try to win — try to not lose ground. Play as close to Stockfish's
      choices as you can, for as many moves as you can.
    </p>
    <p class="todo">Scaffold ready. Board, engine, and scoring come next.</p>
  </main>
</template>

<style scoped>
.trainer {
  max-width: 42rem;
  margin: 4rem auto;
  padding: 0 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.55;
  color: #1a1a1a;
}
h1 {
  font-size: 2.25rem;
  margin: 0 0 0.5rem;
  letter-spacing: -0.02em;
}
.tagline {
  font-size: 1.05rem;
  color: #333;
}
.todo {
  margin-top: 1.5rem;
  color: #888;
  font-style: italic;
}
</style>
