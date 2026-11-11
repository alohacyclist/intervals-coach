/**
 * Registers the service worker that keeps the program files (src/sw/sw.ts). Only in a
 * build: in development it would hold on to files the dev server wants to replace.
 */
export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    // A browser that refuses (private mode, blocked storage) simply runs without it.
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
