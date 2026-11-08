import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works when hosted from a sub-folder
  // (HTML5 game portals typically serve uploads from nested paths / iframes).
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Phaser itself is ~1.2 MB minified (~330 KB gzip); that single vendor
    // chunk is expected, so raise the warning threshold above it.
    chunkSizeWarningLimit: 1600,
  },
});
