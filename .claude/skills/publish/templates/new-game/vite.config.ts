import { defineConfig } from 'vitest/config'

// base './' (relative paths) so the same build runs on the Worker, inside CrazyGames' iframe and, for Steam, over file://.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 800 }, // three.js alone is about 530 kB
  test: { include: ['src/**/*.test.ts'] },
})
