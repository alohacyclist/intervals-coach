import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  // Named explicitly rather than left to the default, so a phone two versions
  // behind gets a bundle it can parse instead of a blank page.
  build: { outDir: 'dist', target: ['es2020', 'safari14'] },
})
