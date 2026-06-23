<script setup lang="ts">
// Training screen: the whole loop lives in <ChessTrainer> (board ↔ engine ↔
// drift-budget scoring), auto-imported from app/components.
useHead({
  title: 'n-moves',
  meta: [{ name: 'description', content: 'Play like the computer — minimise your eval drift from Stockfish.' }],
})
</script>

<template>
  <ChessTrainer />
</template>
