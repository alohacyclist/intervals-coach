import type { RateLimiter } from './bindings.ts'

/**
 * Per athlete, so one busy tab cannot spend the intervals.icu allowance the
 * whole app shares. Counted by Cloudflare's rate limiting binding, per data
 * centre and without KV writes; the numbers live in wrangler.jsonc. Opening
 * the plan takes about ten requests, so the limit only meets runaway clients.
 * A limiter that fails lets the request through: it guards, it does not gate.
 */
export const withinLimit = async (limiter: RateLimiter | undefined, athleteId: string): Promise<boolean> => {
  if (!limiter) return true
  try {
    return (await limiter.limit({ key: `api:${athleteId}` })).success
  } catch (error) {
    console.error('rate limiter unavailable', error)
    return true
  }
}
