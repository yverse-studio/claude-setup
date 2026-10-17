import { defineConfig } from 'vitest/config'

// base '/' for the Worker (live and Previews); an Electron build for Steam adds a './' build (game-3d skill).
export default defineConfig({
  base: '/',
  build: { chunkSizeWarningLimit: 800 }, // three.js alone is about 530 kB
  test: { include: ['src/**/*.test.ts'] },
})
