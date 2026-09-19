import type { KVNamespace } from './bindings.ts'

/**
 * A shared password is only as good as the number of guesses it survives. Failed
 * attempts are counted per client for a quarter of an hour; the counter lives in
 * KV with a TTL, so nothing has to clean it up.
 */
export const MAX_ATTEMPTS = 10
export const WINDOW_SECONDS = 15 * 60

const key = (client: string): string => `login-attempts:${client}`

const count = async (namespace: KVNamespace, client: string): Promise<number> => {
  const stored = await namespace.get(key(client), 'text')
  const parsed = Number(stored)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const blocked = async (namespace: KVNamespace, client: string): Promise<boolean> =>
  (await count(namespace, client)) >= MAX_ATTEMPTS

export const recordFailure = async (namespace: KVNamespace, client: string): Promise<number> => {
  const next = (await count(namespace, client)) + 1
  await namespace.put(key(client), String(next), { expirationTtl: WINDOW_SECONDS })
  return next
}

/** A correct password clears the slate, so a typo before it costs nothing later. */
export const clearFailures = (namespace: KVNamespace, client: string): Promise<void> =>
  namespace.delete(key(client))
