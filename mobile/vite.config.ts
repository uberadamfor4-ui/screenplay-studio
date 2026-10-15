import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  base: './',
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { target: 'chrome80', outDir: 'dist', emptyOutDir: true },
})
