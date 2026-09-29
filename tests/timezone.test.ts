import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { localHour, localToday, validTimeZone } from '../server/routes.ts'
import { loadUser, saveUser } from '../worker/users.ts'
import { saveLink } from '../worker/strava-store.ts'
import { syncStrava } from '../worker/strava-cron.ts'
import { kvConfigStore } from '../worker/config-store-kv.ts'
import { SESSION_SECRET, call, fakeKv, json, multiUserEnv, sessionFor, singleUserEnv, PASSWORD } from './worker-fakes.ts'

const LATE_EVENING_UTC = new Date('2026-09-24T23:30:00Z')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the athlete’s clock', () => {
  it('decides what today and the hour are', () => {
    expect(localToday(LATE_EVENING_UTC)).toBe('2026-09-25')
    expect(localToday(LATE_EVENING_UTC, 'America/New_York')).toBe('2026-09-24')
    expect(localHour(LATE_EVENING_UTC)).toBe(1)
    expect(localHour(LATE_EVENING_UTC, 'America/New_York')).toBe(19)
  })

  it('only accepts zones the runtime knows', () => {
    expect(validTimeZone('Europe/Vienna')).toBe('Europe/Vienna')
    expect(validTimeZone('Mars/Olympus_Mons')).toBeNull()
    expect(validTimeZone('')).toBeNull()
    expect(validTimeZone(42)).toBeNull()
    expect(validTimeZone(undefined)).toBeNull()
  })
})

describe('the timezone from the intervals.icu profile', () => {
  const signIn = async (timezone: unknown) => {
    const env = multiUserEnv()
    vi.stubGlobal('fetch', async (input: string) =>
      new URL(input).pathname === '/api/oauth/token'
        ? json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 })
        : json({ id: 'i7', name: 'Sam', timezone }),
    )
    await call('/auth/callback?code=c&state=s', { headers: { Cookie: 'coach_oauth_state=s' } }, env)
    return (await loadUser(env.COACH_CONFIG, SESSION_SECRET, 'i7'))?.timezone
  }

  it('is kept at sign-in, with Berlin where the profile has none or nonsense', async () => {
    expect(await signIn('America/Los_Angeles')).toBe('America/Los_Angeles')
    expect(await signIn(undefined)).toBe('Europe/Berlin')
    expect(await signIn('Nowhere/Land')).toBe('Europe/Berlin')
  })

  it('sets the first day of the plan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(LATE_EVENING_UTC)
    vi.stubGlobal('fetch', async (input: string) =>
      json(/^\/api\/v1\/athlete\/[^/]+$/.test(new URL(input).pathname) ? {} : []),
    )
    const firstDay = async (timezone: string | undefined) => {
      const env = multiUserEnv()
      await saveUser(env.COACH_CONFIG, SESSION_SECRET, {
        athleteId: 'i7',
        name: 'Sam',
        tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: 2_000_000_000 },
        createdAt: '2026-09-01T00:00:00Z',
        consentAt: '2026-09-01T00:00:00Z',
        lastSeenAt: new Date().toISOString(),
        ...(timezone ? { timezone } : {}),
      })
      await env.COACH_CONFIG.put('config:i7', JSON.stringify(DEFAULT_CONFIG))
      const plan = (await (await call('/api/plan', { headers: { Cookie: await sessionFor('i7') } }, env)).json()) as {
        days: { date: string }[]
      }
      return plan.days[0]?.date
    }
    expect(await firstDay('America/Los_Angeles')).toBe('2026-09-24')
    expect(await firstDay(undefined)).toBe('2026-09-25')
  })

  it('tells the cron whether it is night where the athlete lives', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 04:30 in Berlin, half past eleven in Tokyo: a look of Tokyo's timetable.
    vi.setSystemTime(new Date('2026-09-24T02:30:00Z'))
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: string) => {
      calls.push(input)
      return json([])
    })
    const run = async (timezone: string) => {
      const kv = fakeKv()
      const env = singleUserEnv(kv, { STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's' })
      const store = kvConfigStore(env.COACH_CONFIG)
      await store.save({ ...DEFAULT_CONFIG, proposals: [{ date: '2026-09-24', recommended: 'x', templateIds: ['x'] }] })
      await saveLink(env.COACH_CONFIG, PASSWORD, {
        subject: 'einzelbetrieb',
        stravaAthleteId: '1',
        name: 'Sam',
        tokens: { accessToken: 's', refreshToken: 'r', expiresAt: 2_000_000_000 },
        appUrl: 'https://coach.test',
        connectedAt: '2026-09-01T00:00:00Z',
        posted: [],
      })
      await syncStrava(env, {
        secret: PASSWORD,
        depsFor: async () => ({ auth: { kind: 'apiKey', apiKey: 'k', athleteId: 'i1' }, store }),
        storeFor: () => store,
        timezoneFor: async () => timezone,
        keepExpiry: false,
      })
    }
    await run('Europe/Berlin')
    expect(calls).toHaveLength(0)
    await run('Asia/Tokyo')
    expect(calls.length).toBeGreaterThan(0)
  })
})
