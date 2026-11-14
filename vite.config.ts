import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { cacheVersion, precacheList } from './src/sw/strategy.ts'

/**
 * Tells the service worker which files this build consists of. The names carry a
 * hash, so the list can only be known once the bundle exists.
 */
const serviceWorkerManifest = (): Plugin => ({
  name: 'etmal-sw-manifest',
  apply: 'build',
  generateBundle(_options, bundle) {
    const worker = bundle['sw.js']
    if (!worker || worker.type !== 'chunk') throw new Error('sw.js fehlt im Build')
    const files = Object.keys(bundle).filter((file) => file !== 'sw.js')
    worker.code = worker.code
      .replaceAll('__PRECACHE__', JSON.stringify(precacheList(files)))
      .replaceAll('__CACHE_VERSION__', JSON.stringify(cacheVersion(files)))
  },
})

export default defineConfig({
  plugins: [react(), serviceWorkerManifest()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  // Named explicitly rather than left to the default, so a phone two versions
  // behind gets a bundle it can parse instead of a blank page.
  build: {
    outDir: 'dist',
    target: ['es2020', 'safari14'],
    rollupOptions: {
      input: { index: 'index.html', sw: 'src/sw/sw.ts' },
      output: {
        // The worker keeps its name: a hashed one could never be found again to be replaced.
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
