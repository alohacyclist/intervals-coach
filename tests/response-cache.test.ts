import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { bypassingReads, fetchSportSettings, updateSportThreshold } from '../server/intervals.ts'
import type { IntervalsAuth } from '../server/intervals.ts'
import { TTL_SECONDS, responseCache } from '../worker/response-cache.ts'
import type { EdgeCache } from '../worker/response-cache.ts'
import { saveUser } from '../worker/users.ts'
import { SESSION_SECRET, call, json, multiUserEnv, sessionFor } from './worker-fakes.ts'

const fakeEdgeCache = () => {
  const entries = new Map<string, { readonly body: string; readonly cacheControl: string | null }>()
  const cache: EdgeCache = {
    match: async (key) => {
      const entry = entries.get(key)
      return entry ? new Response(entry.body) : undefined
    },
    put: async (key, response) => {
      entries.set(key, { body: await response.text(), cacheControl: response.headers.get('Cache-Control') })
    },
  }
  return { cache, entries }
}

const stubIntervals = () => {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname.replace('/api/v1', '')
    calls.push(`${init?.method ?? 'GET'} ${path}`)
    if (path.endsWith('/sport-settings')) return json([{ types: ['Ride'], ftp: 250 }])
    if (/^\/athlete\/[^/]+$/.test(path)) return json({})
    return json([])
  })
  return calls
}

const authWith = (cache: EdgeCache, athleteId = 'iA', secret = SESSION_SECRET): IntervalsAuth => ({
  kind: 'bearer',
  accessToken: 't',
  athleteId,
  cache: responseCache(cache, 'https://coach.test', athleteId, secret),
})

afterEach(() => vi.unstubAllGlobals())

describe('the intervals.icu response cache', () => {
  it('answers a repeated read from memory, for a few minutes only', async () => {
    const { cache, entries } = fakeEdgeCache()
    const calls = stubIntervals()
    const auth = authWith(cache)

    expect((await fetchSportSettings(auth)).ftp).toBe(250)
    expect((await fetchSportSettings(auth)).ftp).toBe(250)
    expect(calls).toEqual(['GET /athlete/iA/sport-settings'])
    expect([...entries.values()].map((entry) => entry.cacheControl)).toContain(`max-age=${TTL_SECONDS}`)
    expect(TTL_SECONDS).toBeLessThanOrEqual(5 * 60)
  })

  it('forgets everything read before a write, also for a later request', async () => {
    const { cache } = fakeEdgeCache()
    const calls = stubIntervals()
    await fetchSportSettings(authWith(cache))
    await updateSportThreshold(authWith(cache), 'Ride', 260)
    await fetchSportSettings(authWith(cache))
    expect(calls).toEqual([
      'GET /athlete/iA/sport-settings',
      'PUT /athlete/iA/sport-settings/Ride',
      'GET /athlete/iA/sport-settings',
    ])
  })

  it('asks again on an explicit refresh and keeps the new answer', async () => {
    const { cache } = fakeEdgeCache()
    const calls = stubIntervals()
    await fetchSportSettings(authWith(cache))
    await fetchSportSettings(bypassingReads(authWith(cache)))
    await fetchSportSettings(authWith(cache))
    expect(calls).toHaveLength(2)
  })

  it('keeps athletes apart and stores nothing readable', async () => {
    const { cache, entries } = fakeEdgeCache()
    const calls = stubIntervals()
    await fetchSportSettings(authWith(cache, 'iA'))
    await fetchSportSettings(authWith(cache, 'iB'))
    await fetchSportSettings(authWith(cache, 'iA', 'another-secret'))
    expect(calls).toEqual(['GET /athlete/iA/sport-settings', 'GET /athlete/iB/sport-settings', 'GET /athlete/iA/sport-settings'])
    expect([...entries.values()].map((entry) => entry.body).join('')).not.toContain('250')
  })

  it('falls back to intervals.icu when the cache itself fails', async () => {
    const calls = stubIntervals()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: EdgeCache = {
      match: () => Promise.reject(new Error('cache down')),
      put: () => Promise.reject(new Error('cache down')),
    }
    expect((await fetchSportSettings(authWith(broken))).ftp).toBe(250)
    expect(calls).toHaveLength(1)
  })
})

describe('the plan with the cache in the Worker', () => {
  const setUp = async () => {
    const { cache } = fakeEdgeCache()
    vi.stubGlobal('caches', { default: cache })
    const env = multiUserEnv()
    await saveUser(env.COACH_CONFIG, SESSION_SECRET, {
      athleteId: 'iA',
      name: 'A',
      tokens: { accessToken: 't', refreshToken: 'r', expiresAt: 2_000_000_000 },
      createdAt: '2026-09-01T00:00:00Z',
      consentAt: '2026-09-01T00:00:00Z',
      lastSeenAt: new Date().toISOString(),
    })
    await env.COACH_CONFIG.put('config:iA', JSON.stringify(DEFAULT_CONFIG))
    return { env, cookie: await sessionFor('iA') }
  }

  it('builds a reload from memory, but the refresh button from intervals.icu', async () => {
    const { env, cookie } = await setUp()
    const calls = stubIntervals()

    expect((await call('/api/plan', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    const first = calls.length
    expect(first).toBeGreaterThanOrEqual(5)

    expect((await call('/api/plan', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    expect(calls).toHaveLength(first)

    expect((await call('/api/plan?frisch=1', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    expect(calls).toHaveLength(first * 2)
  })

  it('checks the live calendar before pushing, so a workout deleted there can be sent again', async () => {
    const { env, cookie } = await setUp()
    const calls = stubIntervals()
    // The week the push looks at, so without the bypass its calendar would come from memory.
    const plan = (await (await call('/api/plan?days=7', { headers: { Cookie: cookie } }, env)).json()) as {
      days: { date: string; options: { template: { id: string } }[] }[]
    }
    const day = plan.days[0]!
    const before = calls.length
    await call(
      '/api/push',
      { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ date: day.date, templateId: day.options[0]!.template.id }) },
      env,
    )
    expect(calls.slice(before)).toContain('GET /athlete/iA/events')
  })

  it('reads the calendar again after a workout was pushed to it', async () => {
    const { env, cookie } = await setUp()
    const calls = stubIntervals()
    const plan = (await (await call('/api/plan', { headers: { Cookie: cookie } }, env)).json()) as {
      days: { date: string; options: { template: { id: string } }[] }[]
    }
    const day = plan.days[0]!
    const push = await call(
      '/api/push',
      { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ date: day.date, templateId: day.options[0]!.template.id }) },
      env,
    )
    expect(push.status).toBe(200)
    const before = calls.length
    await call('/api/plan', { headers: { Cookie: cookie } }, env)
    expect(calls.slice(before)).toContain(`GET /athlete/iA/events`)
  })
})
