import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: ['Regular', 'Bold'].map(weight => ({
      find: new RegExp(`^.*[/\\\\]ScreenplayCJK-${weight}\\.otf(?=\\?|$)`),
      replacement: normalizePath(fileURLToPath(new URL(`./src/assets/fonts/ScreenplayCJKMobile-${weight}.otf`, import.meta.url))),
    })),
  },
  base: './',
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { target: 'chrome74', outDir: 'dist', emptyOutDir: true },
})
