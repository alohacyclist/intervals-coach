import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { saveUser } from '../worker/users.ts'
import type { User } from '../worker/users.ts'
import { saveLink } from '../worker/strava-store.ts'
import type { Bindings } from '../worker/bindings.ts'
import { SESSION_SECRET, call, fakeKv, json, multiUserEnv, sessionFor } from './worker-fakes.ts'

const userOf = (athleteId: string): User => ({
  athleteId,
  name: `Athlet ${athleteId}`,
  tokens: { accessToken: `access-${athleteId}`, refreshToken: `refresh-${athleteId}`, expiresAt: 2_000_000_000 },
  createdAt: '2026-09-01T00:00:00Z',
  consentAt: '2026-09-01T00:00:00Z',
  lastSeenAt: new Date().toISOString(),
})

type Seen = { readonly method: string; readonly url: string; readonly authorization: string | null }

const stubIntervals = () => {
  const seen: Seen[] = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    seen.push({ method: init?.method ?? 'GET', url: input, authorization: headers.get('Authorization') })
    return json(new URL(input).pathname.endsWith('/sport-settings') ? [] : {})
  })
  return seen
}

const twoAthletes = async (env: Bindings) => {
  await saveUser(env.COACH_CONFIG, SESSION_SECRET, userOf('iA'))
  await saveUser(env.COACH_CONFIG, SESSION_SECRET, userOf('iB'))
  return { a: await sessionFor('iA'), b: await sessionFor('iB') }
}

const putConfig = (env: Bindings, cookie: string, config: unknown) =>
  call('/api/config', { method: 'PUT', headers: { Cookie: cookie }, body: JSON.stringify(config) }, env)

afterEach(() => vi.unstubAllGlobals())

describe('two athletes on one deployment', () => {
  it('keeps each configuration under its own key and serves each athlete only their own', async () => {
    const kv = fakeKv()
    const env = multiUserEnv(kv)
    const { a, b } = await twoAthletes(env)
    stubIntervals()

    expect((await putConfig(env, a, DEFAULT_CONFIG)).status).toBe(200)
    expect((await putConfig(env, b, { ...DEFAULT_CONFIG, strengthLog: ['2026-09-01'] })).status).toBe(200)

    const configOf = async (cookie: string) =>
      (await (await call('/api/config', { headers: { Cookie: cookie } }, env)).json()) as { strengthLog: string[] }
    expect((await configOf(a)).strengthLog).toEqual([])
    expect((await configOf(b)).strengthLog).toEqual(['2026-09-01'])
    expect([...kv.store.keys()].sort()).toEqual(['config:iA', 'config:iB', 'user:iA', 'user:iB'])
  })

  it('asks intervals.icu for the signed-in athlete only, with that athlete’s token', async () => {
    const env = multiUserEnv()
    const { a, b } = await twoAthletes(env)
    const seen = stubIntervals()

    await call('/api/sport-settings', { headers: { Cookie: a } }, env)
    await call('/api/sport-settings', { headers: { Cookie: b } }, env)
    expect(seen.map((entry) => [new URL(entry.url).pathname, entry.authorization])).toEqual([
      ['/api/v1/athlete/iA/sport-settings', 'Bearer access-iA'],
      ['/api/v1/athlete/iB/sport-settings', 'Bearer access-iB'],
    ])
  })

  it('does not let a session be pointed at another athlete', async () => {
    const env = multiUserEnv()
    const { a } = await twoAthletes(env)
    const [name, value] = a.split('=') as [string, string]
    const [payload, signature] = decodeURIComponent(value).split('.') as [string, string]
    const claims = JSON.parse(atob(payload)) as { athleteId: string; exp: number }
    const forged = `${name}=${encodeURIComponent(`${btoa(JSON.stringify({ ...claims, athleteId: 'iB' }))}.${signature}`)}`

    const response = await call('/api/config', { headers: { Cookie: forged } }, env)
    expect(response.status).toBe(401)
    const foreign = await sessionFor('iB', 'another-deployment-secret')
    expect((await call('/api/config', { headers: { Cookie: foreign } }, env)).status).toBe(401)
  })

  it('stores tokens only encrypted', async () => {
    const kv = fakeKv()
    await twoAthletes(multiUserEnv(kv))
    const raw = [...kv.store.values()].map((entry) => entry.value).join('\n')
    expect(raw).not.toContain('access-iA')
    expect(raw).not.toContain('refresh-iB')
  })
})

describe('deleting an account', () => {
  it('erases exactly that athlete — account, configuration and Strava link — and ends the session', async () => {
    const kv = fakeKv()
    const env = multiUserEnv(kv, { STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's' })
    const { a, b } = await twoAthletes(env)
    const seen = stubIntervals()
    await putConfig(env, a, DEFAULT_CONFIG)
    await putConfig(env, b, DEFAULT_CONFIG)
    await saveLink(env.COACH_CONFIG, SESSION_SECRET, {
      subject: 'iA',
      stravaAthleteId: '9',
      name: 'A',
      tokens: { accessToken: 'strava-a', refreshToken: 'r', expiresAt: 2_000_000_000 },
      appUrl: 'https://coach.test',
      connectedAt: '2026-09-01T00:00:00Z',
      posted: [],
    })

    const response = await call('/api/account', { method: 'DELETE', headers: { Cookie: a } }, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect([...kv.store.keys()].sort()).toEqual(['config:iB', 'user:iB'])
    expect(seen.some((entry) => entry.url === 'https://www.strava.com/oauth/deauthorize')).toBe(true)

    // A copy of the old cookie finds nothing left to act on.
    const replay = await call('/api/plan', { headers: { Cookie: a } }, env)
    expect(replay.status).toBe(401)
    expect(await replay.json()).toMatchObject({ needsLogin: true })
    expect((await call('/api/config', { headers: { Cookie: b } }, env)).status).toBe(200)
  })

  it('is refused without a session', async () => {
    expect((await call('/api/account', { method: 'DELETE' }, multiUserEnv())).status).toBe(401)
  })
})
