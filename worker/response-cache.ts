import type { ResponseCache } from '../server/intervals.ts'
import { decryptJson, encryptJson, randomToken } from './crypto.ts'

/**
 * Recent intervals.icu answers per athlete, in the Cache API of the data centre
 * serving the athlete. Chosen over KV on purpose: KV allows a thousand writes a
 * day on the free plan and propagates a delete only within a minute, so a
 * workout pushed to the calendar could reappear as missing. The Cache API has no
 * write quota, and the athlete's next request lands in the same data centre that
 * just forgot the old answers. Entries are encrypted like the tokens in KV, and
 * nothing outlives `TTL_SECONDS` — the privacy notice promises exactly that.
 */
export const TTL_SECONDS = 5 * 60
/** The pointer to the current entries outlives them; losing it only costs a fresh read. */
const GENERATION_TTL_SECONDS = 24 * 60 * 60
const PREFIX = '/__intervals-cache'

/** The part of the Workers `Cache` this module uses. */
export type EdgeCache = {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
}

/** `caches.default` exists in workerd only; under Node and in tests without a stub there is no cache. */
export const edgeCache = (): EdgeCache | null =>
  (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null

type Stored = { readonly value: unknown }

const cacheable = (body: string, maxAge: number): Response =>
  new Response(body, { headers: { 'Cache-Control': `max-age=${maxAge}`, 'Content-Type': 'text/plain' } })

/**
 * Clearing does not delete: it moves the athlete to a new generation, so every
 * older entry becomes unreachable at once and expires on its own.
 */
export const responseCache = (cache: EdgeCache, origin: string, athleteId: string, secret: string): ResponseCache => {
  const base = `${origin}${PREFIX}/${encodeURIComponent(athleteId)}`
  const generationKey = `${base}/generation`
  const readGeneration = async (): Promise<string> =>
    (await (await cache.match(generationKey))?.text()) ?? 'initial'
  // Kept per request, so a read after a write in the same request never sees the old answers.
  let generation: Promise<string> = readGeneration().catch(() => 'initial')
  const entryKey = async (path: string): Promise<string> => `${base}/${await generation}${path}`

  return {
    read: async (path) => {
      try {
        const hit = await cache.match(await entryKey(path))
        if (!hit) return undefined
        const stored = await decryptJson<Stored>(await hit.text(), secret)
        return stored?.value
      } catch (error) {
        console.error('intervals cache read failed', error)
        return undefined
      }
    },
    write: async (path, value) => {
      try {
        const stored: Stored = { value }
        await cache.put(await entryKey(path), cacheable(await encryptJson(stored, secret), TTL_SECONDS))
      } catch (error) {
        console.error('intervals cache write failed', error)
      }
    },
    clear: async () => {
      const next = randomToken()
      generation = Promise.resolve(next)
      try {
        await cache.put(generationKey, cacheable(next, GENERATION_TTL_SECONDS))
      } catch (error) {
        console.error('intervals cache clear failed', error)
      }
    },
  }
}
