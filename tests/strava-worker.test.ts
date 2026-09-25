import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { app } from '../worker/index.ts'
import type { Bindings, KVNamespace, KVPutOptions } from '../worker/bindings.ts'
import { loadLink, saveLink } from '../worker/strava-store.ts'
import { syncStrava } from '../worker/strava-cron.ts'
import { kvConfigStore } from '../worker/config-store-kv.ts'
import type { StravaLink } from '../worker/strava-store.ts'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { SIGNATURE } from '../src/coach/strava-summary.ts'

type Stored = { readonly value: string; readonly options: KVPutOptions | undefined }

const fakeKv = () => {
  const store = new Map<string, Stored>()
  const namespace: KVNamespace = {
    get: async (key) => store.get(key)?.value ?? null,
    put: async (key, value, options) => {
      store.set(key, { value, options })
    },
    delete: async (key) => {
      store.delete(key)
    },
    list: async ({ prefix }) => ({
      keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name, expiration: 2_000_000_000 })),
      list_complete: true,
    }),
  }
  return { namespace, store }
}

const PASSWORD = 'ein-langes-testpasswort'
const SUBJECT = 'einzelbetrieb'

const setup = () => {
  const kv = fakeKv()
  const env: Bindings = {
    ASSETS: { fetch: async () => new Response('shell') },
    COACH_CONFIG: kv.namespace,
    INTERVALS_API_KEY: 'key',
    INTERVALS_ATHLETE_ID: 'i1',
    APP_PASSWORD: PASSWORD,
    STRAVA_CLIENT_ID: '4711',
    STRAVA_CLIENT_SECRET: 'strava-secret',
  }
  return { env, kv }
}

const call = (path: string, init: RequestInit, env: Bindings) => app.request(`https://coach.test${path}`, init, env)

const signIn = async (env: Bindings): Promise<string> => {
  const response = await call('/api/login', { method: 'POST', body: JSON.stringify({ passwort: PASSWORD }) }, env)
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? ''
}

const ftp = DEFAULT_CONFIG.profile.sports.find((setting) => setting.sport === 'Ride')?.threshold
const watts = (percent: number) => Math.round(((ftp?.metric === 'power' ? ftp.ftp : 250) * percent) / 100)

const START = '2026-09-24T16:00:00Z'

/** One threshold ride on intervals.icu, and the same ride on Strava, uploaded there by the device. */
type Ride = { readonly id: string; readonly start: string; readonly stravaId: number }
const MORNING: Ride = { id: 'i76', start: '2026-09-24T06:00:00Z', stravaId: 98764 }
const EVENING: Ride = { id: 'i77', start: START, stravaId: 98765 }

type PlatformOptions = {
  readonly onStrava?: boolean
  readonly description?: string | null
  readonly rides?: readonly Ride[]
  /** Strava ids whose description refuses to be written, with this status (the rate limit by default). */
  readonly refuse?: readonly number[]
  readonly status?: number
  /** Runs while a description is being written — for what happens in the meantime. */
  readonly whileWriting?: () => Promise<void>
}

const platforms = (options: PlatformOptions = {}) => {
  const writes: { readonly id: string; readonly description: string }[] = []
  const calls: string[] = []
  const rides = options.rides ?? [EVENING]
  const stravaActivities =
    options.onStrava === false
      ? []
      : rides.map((ride) => ({
          id: ride.stravaId,
          sport_type: 'VirtualRide',
          start_date: new Date(Date.parse(ride.start) + 12_000).toISOString(),
        }))

  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    calls.push(`${init?.method ?? 'GET'} ${url.host}${url.pathname}`)
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

    if (url.host === 'www.strava.com') {
      if (url.pathname === '/oauth/token') {
        return json({
          access_token: 'strava-access',
          refresh_token: 'strava-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 6 * 3600,
          athlete: { id: 555, firstname: 'Christian', lastname: 'M' },
        })
      }
      if (url.pathname === '/oauth/deauthorize') return json({})
      if (url.pathname === '/api/v3/athlete/activities') return json(stravaActivities)
      const stravaId = Number(/^\/api\/v3\/activities\/(\d+)$/.exec(url.pathname)?.[1])
      if (init?.method === 'PUT') {
        if (options.refuse?.includes(stravaId)) return json({ message: 'refused' }, options.status ?? 429)
        await options.whileWriting?.()
        writes.push({ id: String(stravaId), description: (JSON.parse(String(init.body)) as { description: string }).description })
        return json({ id: stravaId })
      }
      if (stravaId) return json({ id: stravaId, description: options.description ?? null })
      return json({}, 404)
    }

    const path = url.pathname.replace('/api/v1', '')
    const raw = (ride: Ride) => ({
      id: ride.id,
      type: 'VirtualRide',
      start_date_local: '2026-09-24T18:00:00',
      start_date: ride.start,
      icu_training_load: 80,
      moving_time: 4000,
    })
    if (path === '/athlete/i1/activities') return json(rides.map(raw))
    if (path === '/athlete/i1/events') {
      return json(
        rides.map((ride) => ({
          id: `e-${ride.id}`,
          category: 'WORKOUT',
          start_date_local: '2026-09-24T00:00:00',
          name: 'Schwelle',
          external_id: 'coach:2026-09-24:bike-thr-3x12',
          paired_activity_id: ride.id,
        })),
      )
    }
    const [, id, rest] = /^\/activity\/([^/]+)(\/.*)?$/.exec(path) ?? []
    const ride = rides.find((entry) => entry.id === id)
    if (!ride) return json({}, 404)
    if (rest === '/intervals') {
      return json({
        icu_intervals: [0, 1, 2].map((index) => ({
          type: 'WORK',
          moving_time: 720,
          average_watts: watts(100),
          start_time: 900 + index * 1020,
          end_time: 1620 + index * 1020,
        })),
      })
    }
    if (rest === '/streams.json') return json([])
    return json(raw(ride))
  })
  return { writes, calls }
}

const connected = async (env: Bindings, overrides: Partial<StravaLink> = {}) =>
  saveLink(env.COACH_CONFIG, PASSWORD, {
    subject: SUBJECT,
    stravaAthleteId: '555',
    name: 'Christian M',
    tokens: { accessToken: 'strava-access', refreshToken: 'strava-refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    appUrl: 'https://coach.test',
    connectedAt: '2026-09-20T10:00:00Z',
    posted: [],
    ...overrides,
  })

const runCron = async (env: Bindings) => {
  const pending: Promise<unknown>[] = []
  worker.scheduled({}, env, { waitUntil: (promise) => pending.push(promise) })
  await Promise.all(pending)
}

afterEach(() => vi.unstubAllGlobals())

describe('connecting Strava', () => {
  it('asks Strava for read and write access to activities, guarded by a state cookie', async () => {
    const { env } = setup()
    const response = await call('/auth/strava/login', { headers: { Cookie: await signIn(env) } }, env)
    const target = new URL(response.headers.get('Location') ?? '')
    expect(target.host).toBe('www.strava.com')
    expect(target.searchParams.get('scope')).toBe('activity:read_all,activity:write')
    expect(target.searchParams.get('redirect_uri')).toBe('https://coach.test/auth/strava/callback')
    expect(response.headers.get('Set-Cookie')).toContain(`coach_strava_state=${target.searchParams.get('state')}`)
  })

  it('keeps its own state, so a sign-in with intervals.icu in another tab does not break it', async () => {
    const { env } = setup()
    platforms()
    const cookie = `${await signIn(env)}; coach_strava_state=abc; coach_oauth_state=other`
    const response = await call('/auth/strava/callback?code=c&state=abc&scope=activity:write,activity:read_all', { headers: { Cookie: cookie } }, env)
    expect(response.headers.get('Location')).toBe('/app?strava=verbunden')
  })

  it('sends a visitor without a session back to the start', async () => {
    const { env } = setup()
    const response = await call('/auth/strava/login', {}, env)
    expect(response.headers.get('Location')).toBe('/')
  })

  it('stores the link once Strava granted write access', async () => {
    const { env } = setup()
    platforms()
    const cookie = `${await signIn(env)}; coach_strava_state=abc`
    const response = await call('/auth/strava/callback?code=c&state=abc&scope=read,activity:write,activity:read_all', { headers: { Cookie: cookie } }, env)
    expect(response.headers.get('Location')).toBe('/app?strava=verbunden')

    const status = await (await call('/api/strava', { headers: { Cookie: cookie } }, env)).json()
    expect(status).toEqual({ available: true, connected: true, name: 'Christian M', posted: [] })
  })

  it('refuses a link without write access and a forged state', async () => {
    const { env } = setup()
    platforms()
    const cookie = `${await signIn(env)}; coach_strava_state=abc`
    const narrow = await call('/auth/strava/callback?code=c&state=abc&scope=read,activity:read', { headers: { Cookie: cookie } }, env)
    expect(narrow.headers.get('Location')).toBe('/app?strava=rechte')
    const forged = await call('/auth/strava/callback?code=c&state=xyz&scope=activity:write,activity:read_all', { headers: { Cookie: cookie } }, env)
    expect(forged.headers.get('Location')).toBe('/app?strava=fehler')
    expect(await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT)).toBeNull()
  })

  it('withdraws access on Strava when disconnecting', async () => {
    const { env } = setup()
    const { calls } = platforms()
    await connected(env)
    const response = await call('/api/strava', { method: 'DELETE', headers: { Cookie: await signIn(env) } }, env)
    expect(response.status).toBe(200)
    expect(calls).toContain('POST www.strava.com/oauth/deauthorize')
    expect(await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT)).toBeNull()
  })
})

describe('disconnecting with an expired token', () => {
  it('refreshes it first, so Strava really withdraws the access', async () => {
    const { env } = setup()
    const { calls } = platforms()
    await connected(env, {
      tokens: { accessToken: 'old', refreshToken: 'strava-refresh', expiresAt: Math.floor(Date.now() / 1000) - 60 },
    })
    await call('/api/strava', { method: 'DELETE', headers: { Cookie: await signIn(env) } }, env)
    const strava = calls.filter((entry) => entry.includes('www.strava.com/oauth'))
    expect(strava).toEqual(['POST www.strava.com/oauth/token', 'POST www.strava.com/oauth/deauthorize'])
  })
})

describe('writing a session to Strava', () => {
  it('adds the summary under what the athlete wrote, on the session with the same start', async () => {
    const { env } = setup()
    const { writes } = platforms({ description: 'Beine schwer.' })
    await connected(env)
    const response = await call(
      '/api/strava/sessions',
      {
        method: 'POST',
        headers: { Cookie: await signIn(env) },
        body: JSON.stringify({ activityId: 'i77', templateId: 'bike-thr-3x12', date: '2026-09-24' }),
      },
      env,
    )
    expect(await response.json()).toEqual({ status: 'posted', activityId: 'i77', stravaId: '98765' })
    expect(writes).toHaveLength(1)
    expect(writes[0]?.description.startsWith('Beine schwer.\n\n')).toBe(true)
    expect(writes[0]?.description).toContain('3 von 3 im Ziel ✓✓✓')
    expect(writes[0]?.description).toContain(`— ${SIGNATURE} · https://coach.test`)
    expect((await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT))?.posted[0]?.activityId).toBe('i77')
  })

  it('says so when the session is not on Strava', async () => {
    const { env } = setup()
    const { writes } = platforms({ onStrava: false })
    await connected(env)
    const response = await call(
      '/api/strava/sessions',
      {
        method: 'POST',
        headers: { Cookie: await signIn(env) },
        body: JSON.stringify({ activityId: 'i77', templateId: 'bike-thr-3x12', date: '2026-09-24' }),
      },
      env,
    )
    expect(await response.json()).toEqual({ status: 'not-found', activityId: 'i77' })
    expect(writes).toHaveLength(0)
  })
})

describe('the cron', () => {
  it('writes each recognised session once, then leaves it alone', async () => {
    const { env } = setup()
    const { writes } = platforms()
    await connected(env)
    await runCron(env)
    await runCron(env)
    expect(writes).toHaveLength(1)
    expect(writes[0]?.description).toContain(SIGNATURE)
  })

  it('writes the other sessions when Strava refuses one of them', async () => {
    const { env } = setup()
    const { writes } = platforms({ rides: [EVENING, MORNING], refuse: [EVENING.stravaId], status: 500 })
    await connected(env)
    await runCron(env)
    expect(writes.map((write) => write.id)).toEqual([String(MORNING.stravaId)])
    expect((await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT))?.posted.map((entry) => entry.activityId)).toEqual([
      MORNING.id,
    ])
  })

  it('stops at the rate limit but keeps what it wrote before', async () => {
    const { env } = setup()
    const { writes, calls } = platforms({ rides: [MORNING, EVENING, { id: 'i75', start: '2026-09-24T09:00:00Z', stravaId: 98763 }], refuse: [EVENING.stravaId] })
    await connected(env)
    await runCron(env)
    expect(writes.map((write) => write.id)).toEqual([String(MORNING.stravaId)])
    expect(calls).not.toContain('GET www.strava.com/api/v3/activities/98763')
    expect((await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT))?.posted.map((entry) => entry.activityId)).toEqual([
      MORNING.id,
    ])
  })

  it('tries again next run when the session has not reached Strava yet', async () => {
    const { env } = setup()
    const { writes } = platforms({ onStrava: false })
    await connected(env)
    await runCron(env)
    expect(writes).toHaveLength(0)
    expect((await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT))?.posted).toEqual([])
  })

  it('refreshes an expiring Strava token and keeps the new one', async () => {
    const { env } = setup()
    const { calls } = platforms()
    await connected(env, {
      tokens: { accessToken: 'old', refreshToken: 'strava-refresh', expiresAt: Math.floor(Date.now() / 1000) + 30 },
    })
    await runCron(env)
    expect(calls).toContain('POST www.strava.com/oauth/token')
    expect((await loadLink(env.COACH_CONFIG, PASSWORD, SUBJECT))?.tokens.accessToken).toBe('strava-access')
  })

  it('does not bring back a link deleted while it was running', async () => {
    const { env } = setup()
    platforms({ whileWriting: () => env.COACH_CONFIG.delete(`strava:${SUBJECT}`) })
    await connected(env)
    await runCron(env)
    expect(await env.COACH_CONFIG.get(`strava:${SUBJECT}`, 'text')).toBeNull()
  })

  it('does nothing without Strava configured', async () => {
    const { env } = setup()
    const { calls } = platforms()
    await connected(env)
    await runCron({ ...env, STRAVA_CLIENT_ID: undefined })
    expect(calls).toEqual([])
  })
})

describe('the retention promise', () => {
  it('lets a cron write keep the expiry the link already had, with accounts', async () => {
    const { env, kv } = setup()
    platforms()
    await connected(env)
    await syncStrava(env, {
      secret: PASSWORD,
      depsFor: async () => ({
        auth: { kind: 'apiKey', apiKey: 'key', athleteId: 'i1' },
        store: kvConfigStore(env.COACH_CONFIG),
      }),
      keepExpiry: true,
    })
    expect(kv.store.get(`strava:${SUBJECT}`)?.options).toEqual({ expiration: 2_000_000_000 })
  })
})
