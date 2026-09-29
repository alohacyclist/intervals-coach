import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { loadUser } from '../worker/users.ts'
import { loadLink } from '../worker/strava-store.ts'
import { SESSION_SECRET, call, fakeKv, json, multiUserEnv, sessionFor } from './worker-fakes.ts'

type Upstream = {
  readonly token?: () => Response | Promise<Response>
  readonly athlete?: () => Response | Promise<Response>
  readonly stravaToken?: () => Response | Promise<Response>
}

const stubUpstream = (upstream: Upstream = {}) =>
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input)
    if (url.host === 'www.strava.com') {
      return (
        upstream.stravaToken?.() ??
        json({ access_token: 's', refresh_token: 'r', expires_at: 2_000_000_000, athlete: { id: 5, firstname: 'A' } })
      )
    }
    if (url.pathname === '/api/oauth/token') {
      return upstream.token?.() ?? json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })
    }
    if (url.pathname === '/api/v1/athlete/0') return upstream.athlete?.() ?? json({ id: 'i42', name: 'Alex' })
    return json({}, 404)
  })

const callback = (env = multiUserEnv(), query = 'code=c&state=abc') =>
  call(`/auth/callback?${query}`, { headers: { Cookie: 'coach_oauth_state=abc' } }, env)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the intervals.icu sign-in callback', () => {
  it('creates the account, starts a session and sends a new athlete to onboarding', async () => {
    const env = multiUserEnv()
    stubUpstream()
    const response = await callback(env)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/onboarding')
    const cookies = response.headers.get('Set-Cookie') ?? ''
    expect(cookies).toContain('coach_oauth_state=;')
    expect(cookies).toContain('coach_session=')
    const user = await loadUser(env.COACH_CONFIG, SESSION_SECRET, 'i42')
    expect(user).toMatchObject({ athleteId: 'i42', name: 'Alex', tokens: { accessToken: 'access' } })
  })

  it('sends a returning athlete with a configuration straight to the plan and keeps the first consent', async () => {
    const env = multiUserEnv()
    stubUpstream()
    await callback(env)
    const firstConsent = (await loadUser(env.COACH_CONFIG, SESSION_SECRET, 'i42'))?.consentAt
    await env.COACH_CONFIG.put('config:i42', JSON.stringify(DEFAULT_CONFIG))

    const again = await callback(env)
    expect(again.headers.get('Location')).toBe('/app')
    expect((await loadUser(env.COACH_CONFIG, SESSION_SECRET, 'i42'))?.consentAt).toBe(firstConsent)
  })

  it.each([
    ['the code exchange is refused', { token: () => new Response('bad code', { status: 400 }) }],
    ['intervals.icu is down', { token: () => new Response('down', { status: 503 }) }],
    ['the network fails', { token: () => Promise.reject(new TypeError('network down')) }],
    ['the profile cannot be read', { athlete: () => new Response('forbidden', { status: 403 }) }],
  ])('sends the athlete back with a message when %s', async (_case, upstream: Upstream) => {
    const env = multiUserEnv()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubUpstream(upstream)
    const response = await callback(env)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/?fehler=anmeldung')
    expect(response.headers.get('Set-Cookie')).not.toContain('coach_session=')
    expect(errors).toHaveBeenCalled()
    expect(await env.COACH_CONFIG.list({ prefix: 'user:' })).toMatchObject({ keys: [] })
  })

  it('refuses a forged state before asking intervals.icu anything', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const response = await callback(multiUserEnv(), 'code=c&state=forged')
    expect(response.headers.get('Location')).toBe('/?fehler=state')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('the Strava connect callback', () => {
  const stravaEnv = () => multiUserEnv(fakeKv(), { STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's' })

  it('sends the athlete back to the settings with a message when Strava fails', async () => {
    const env = stravaEnv()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubUpstream({ stravaToken: () => new Response('down', { status: 500 }) })
    const cookie = `${await sessionFor('i42')}; coach_strava_state=abc`
    const response = await call(
      '/auth/strava/callback?code=c&state=abc&scope=activity:write,activity:read_all',
      { headers: { Cookie: cookie } },
      env,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/app?strava=fehler')
    expect(errors).toHaveBeenCalled()
    expect(await loadLink(env.COACH_CONFIG, SESSION_SECRET, 'i42')).toBeNull()
  })

  it('stores the link under the athlete who connected it', async () => {
    const env = stravaEnv()
    stubUpstream()
    const cookie = `${await sessionFor('i42')}; coach_strava_state=abc`
    await call('/auth/strava/callback?code=c&state=abc&scope=activity:write,activity:read_all', { headers: { Cookie: cookie } }, env)
    expect((await loadLink(env.COACH_CONFIG, SESSION_SECRET, 'i42'))?.subject).toBe('i42')
  })
})
