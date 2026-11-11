/**
 * What the service worker does with a request. The rule that matters: nothing that
 * carries training or health data, a session or a sign-in ever enters a cache. Only
 * the program itself is kept, so the app opens at once and can say that it is offline.
 */

export type Strategy =
  /** Not the worker's business: the browser handles it as if there were none. */
  | 'network'
  /** Files with a hash in their name never change: the copy is as good as the original. */
  | 'cache-first'
  /** A page view: the current page when there is a connection, the kept shell without one. */
  | 'shell'

/** Data, sign-in and health check: always the server, never a copy. */
const PRIVATE_PREFIXES = ['/api/', '/auth/', '/healthz'] as const

export const isPrivate = (pathname: string): boolean =>
  PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))

export const strategyFor = (request: {
  readonly method: string
  readonly url: string
  /** `navigate` for a page view. */
  readonly mode: string
  readonly origin: string
}): Strategy => {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== request.origin) return 'network'
  if (isPrivate(url.pathname)) return 'network'
  if (request.mode === 'navigate') return 'shell'
  if (url.pathname.startsWith('/assets/')) return 'cache-first'
  return 'network'
}

/**
 * The files kept ahead of time: script, styles and the fonts a current browser asks
 * for. The older font format is left to the network — a browser that needs it is rare,
 * and keeping it would double what a phone downloads on the first visit.
 */
export const precacheList = (files: readonly string[]): readonly string[] =>
  files.filter((file) => /^assets\/.+\.(js|css|woff2)$/.test(file)).map((file) => `/${file}`).sort()

/** Changes exactly when a kept file does, so an unchanged build keeps its cache. */
export const cacheVersion = (files: readonly string[]): string => {
  const hash = precacheList(files)
    .join('|')
    .split('')
    .reduce((sum, char) => (Math.imul(sum, 31) + char.charCodeAt(0)) >>> 0, 7)
  return hash.toString(36)
}
