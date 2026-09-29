import { describe, expect, it, vi } from 'vitest'
import { withinLimit } from '../worker/api-throttle.ts'
import type { RateLimiter } from '../worker/bindings.ts'
import { PASSWORD, call, fakeKv, multiUserEnv, sessionFor, singleUserEnv } from './worker-fakes.ts'

/** Allows `limit` requests per key, like the binding within one period. */
const fakeLimiter = (limit: number) => {
  const counts = new Map<string, number>()
  const limiter: RateLimiter = {
    limit: async ({ key }) => {
      const next = (counts.get(key) ?? 0) + 1
      counts.set(key, next)
      return { success: next <= limit }
    },
  }
  return { limiter, counts }
}

describe('the per athlete throttle', () => {
  it('stops one athlete over the limit and leaves the other alone', async () => {
    const { limiter } = fakeLimiter(2)
    const env = multiUserEnv(fakeKv(), { API_LIMITER: limiter })
    const a = await sessionFor('iA')
    const b = await sessionFor('iB')

    const statuses = []
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await call('/api/zwift-routes', { headers: { Cookie: a } }, env)).status)
    }
    expect(statuses).toEqual([200, 200, 429])
    const blocked = await call('/api/zwift-routes', { headers: { Cookie: a } }, env)
    expect(blocked.headers.get('Retry-After')).toBe('60')
    expect(await blocked.json()).toMatchObject({ error: expect.stringContaining('Minute') })
    expect((await call('/api/zwift-routes', { headers: { Cookie: b } }, env)).status).toBe(200)
  })

  it('does not count visitors without a session or the public pages', async () => {
    const { limiter, counts } = fakeLimiter(1)
    const env = multiUserEnv(fakeKv(), { API_LIMITER: limiter })
    await call('/api/plan', {}, env)
    await call('/healthz', {}, env)
    await call('/', {}, env)
    expect(counts.size).toBe(0)
  })

  it('leaves the single user mode alone', async () => {
    const { limiter, counts } = fakeLimiter(0)
    const env = singleUserEnv(fakeKv(), { API_LIMITER: limiter })
    const login = await call('/api/login', { method: 'POST', body: JSON.stringify({ passwort: PASSWORD }) }, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0] ?? ''
    expect((await call('/api/zwift-routes', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    expect(counts.size).toBe(0)
  })

  it('lets requests through when the limiter is missing or failing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await withinLimit(undefined, 'iA')).toBe(true)
    expect(await withinLimit({ limit: () => Promise.reject(new Error('down')) }, 'iA')).toBe(true)
  })
})
