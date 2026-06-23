<script setup lang="ts">
// Global frame: the manga top-nav (wordmark + Trainer/About) over the themed dark
// backdrop, then the routed page. ssr:false, so this is purely client-rendered.
</script>

<template>
  <div class="frame">
    <header class="topbar">
      <NuxtLink to="/" class="brand" aria-label="n-moves home">
        N<span class="dash">—</span>MOVES
      </NuxtLink>
      <nav class="nav">
        <NuxtLink to="/" class="link">Trainer</NuxtLink>
        <NuxtLink to="/about" class="link">About</NuxtLink>
        <ThemeToggle />
      </nav>
    </header>
    <div class="page"><slot /></div>

    <footer class="footer">
      <p>
        Vibe coded with ❤️ by
        <a class="sig" href="https://github.com/ozzyfromspace" target="_blank" rel="noopener noreferrer">ozzyfromspace</a>
      </p>
    </footer>
  </div>
</template>

<style scoped>
.frame {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}
.page {
  flex: 1 0 auto;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.65rem clamp(1rem, 4vw, 2.5rem);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-base) 94%, transparent),
    color-mix(in srgb, var(--bg-base) 74%, transparent)
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--hairline);
  box-shadow: 0 1px 0 rgba(33, 243, 255, 0.22), 0 10px 30px -20px #000;
}
.brand {
  font-family: var(--font-display);
  font-size: 1.75rem;
  letter-spacing: 0.12em;
  color: var(--text);
  text-decoration: none;
}
.brand .dash {
  color: var(--neon-cyan);
  text-shadow: 0 0 10px rgba(33, 243, 255, 0.7);
  margin: 0 0.04em;
}
.nav {
  display: flex;
  gap: 0.4rem;
}
.link {
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text-muted);
  padding: 0.25rem 0.85rem;
  border-radius: 7px;
  border: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.link:hover {
  color: var(--text);
}
.router-link-exact-active.link {
  color: var(--neon-cyan);
  border-color: var(--hairline);
  background: var(--surface);
  box-shadow: inset 0 0 12px rgba(33, 243, 255, 0.12);
}
.footer {
  flex-shrink: 0;
  padding: 1.4rem 1rem 2rem;
  border-top: 1px solid var(--hairline);
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.footer p {
  margin: 0;
}
.footer .sig {
  color: var(--neon-cyan);
  font-weight: 600;
  text-decoration: none;
}
.footer .sig:hover {
  text-decoration: underline;
}
@media (max-width: 30rem) {
  .topbar {
    padding: 0.5rem 0.9rem;
  }
  .brand {
    font-size: 1.4rem;
  }
  .link {
    font-size: 0.9rem;
    padding: 0.2rem 0.55rem;
  }
}
</style>
