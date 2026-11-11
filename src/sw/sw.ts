/**
 * The service worker: keeps the program files so Formkurve opens instantly and installs
 * as an app, and answers a page view without a connection with the kept shell — which
 * then says that it is offline. No plan, no wellness value and no session is ever kept;
 * `strategyFor` is the single place that decides, and it is tested.
 *
 * The two placeholders are filled in by the build (vite.config.ts).
 */
import { strategyFor } from './strategy.ts'

declare const __PRECACHE__: readonly string[]
declare const __CACHE_VERSION__: string

type FetchEventLike = Event & {
  readonly request: Request
  respondWith(response: Promise<Response>): void
}
type ExtendableEventLike = Event & { waitUntil(work: Promise<unknown>): void }
type WorkerScope = {
  readonly location: Location
  readonly clients: { claim(): Promise<void> }
  skipWaiting(): Promise<void>
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
}

const worker = self as unknown as WorkerScope
const PREFIX = 'formkurve-'
const CACHE = `${PREFIX}${__CACHE_VERSION__}`
/** The page itself; asked for as `/`, because the asset server redirects `/index.html` there. */
const SHELL = '/'

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `reload` skips the browser's own cache: the shell kept must be the one just deployed.
      .then((cache) => cache.addAll([SHELL, ...__PRECACHE__].map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => worker.skipWaiting()),
  )
})

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name))),
      )
      .then(() => worker.clients.claim()),
  )
})

const cacheFirst = async (request: Request): Promise<Response> => {
  const cache = await caches.open(CACHE)
  const kept = await cache.match(request)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

/** Online the server answers, so a new version is seen at once; offline the kept shell does. */
const shell = async (request: Request): Promise<Response> => {
  try {
    return await fetch(request)
  } catch (error) {
    const kept = await (await caches.open(CACHE)).match(SHELL)
    if (kept) return kept
    throw error
  }
}

worker.addEventListener('fetch', (event) => {
  const { request } = event
  const strategy = strategyFor({
    method: request.method,
    url: request.url,
    mode: request.mode,
    origin: worker.location.origin,
  })
  if (strategy === 'cache-first') event.respondWith(cacheFirst(request))
  if (strategy === 'shell') event.respondWith(shell(request))
})
