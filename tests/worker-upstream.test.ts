import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { loadUser, saveUser } from '../worker/users.ts'
import type { User } from '../worker/users.ts'
import type { Bindings } from '../worker/bindings.ts'
import { SESSION_SECRET, call, fakeKv, json, multiUserEnv, sessionFor, singleUserEnv } from './worker-fakes.ts'

const SECRET_BODY = 'stacktrace: db-host-17 token=abc'

type Upstream = {
  /** Answers intervals.icu API calls; defaults to an empty but healthy account. */
  readonly api?: (path: string) => Response | Promise<Response>
  /** Answers the OAuth token endpoint. */
  readonly token?: () => Response | Promise<Response>
}

const stubUpstream = (upstream: Upstream = {}) => {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/api/v1/oauth/token') {
      return upstream.token?.() ?? json({ access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600 })
    }
    const path = url.pathname.replace('/api/v1', '')
    if (upstream.api) return upstream.api(path)
    return json(path.startsWith('/athlete/') && path.split('/').length === 3 ? {} : [])
  })
  return calls
}

const now = () => Math.floor(Date.now() / 1000)

const userOf = (athleteId: string, overrides: Partial<User['tokens']> = {}): User => ({
  athleteId,
  name: `Athlet ${athleteId}`,
  tokens: { accessToken: `access-${athleteId}`, refreshToken: `refresh-${athleteId}`, expiresAt: now() + 3600, ...overrides },
  createdAt: '2026-09-01T00:00:00Z',
  consentAt: '2026-09-01T00:00:00Z',
  lastSeenAt: new Date().toISOString(),
})

const signedUp = async (env: Bindings, user: User): Promise<string> => {
  await saveUser(env.COACH_CONFIG, SESSION_SECRET, user)
  await env.COACH_CONFIG.put(`config:${user.athleteId}`, JSON.stringify(DEFAULT_CONFIG))
  return sessionFor(user.athleteId)
}

afterEach(() => vi.unstubAllGlobals())

describe('a revoked intervals.icu grant with accounts', () => {
  it('asks for a new sign-in and ends the session instead of blaming an API key', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10'))
    stubUpstream({ api: () => new Response(SECRET_BODY, { status: 401 }) })

    const response = await call('/api/plan', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(401)
    const body = (await response.json()) as { error: string; needsLogin: boolean }
    expect(body.needsLogin).toBe(true)
    expect(body.error).not.toContain('API-Key')
    expect(body.error).not.toContain(SECRET_BODY)
    expect(response.headers.get('Set-Cookie')).toContain('coach_session=;')
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
  })

  it('treats a refused scope as a refusal, not as a lost session, so no sign-in loop can start', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10'))
    stubUpstream({ api: () => new Response(SECRET_BODY, { status: 403 }) })

    const response = await call('/api/sport-settings', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: string; needsLogin?: boolean }
    expect(body.needsLogin).toBeUndefined()
    expect(body.error).not.toContain(SECRET_BODY)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('asks for a new sign-in when the account record is gone', async () => {
    const env = multiUserEnv()
    stubUpstream()
    const response = await call('/api/plan', { headers: { Cookie: await sessionFor('i404') } }, env)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ needsLogin: true })
  })

  it('asks for a new sign-in when intervals.icu refuses to refresh the token', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10', { expiresAt: now() - 10 }))
    stubUpstream({ token: () => new Response('{"error":"invalid_grant"}', { status: 400 }) })

    const response = await call('/api/plan', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ needsLogin: true })
  })

  it('keeps the session when the token endpoint is merely down', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10', { expiresAt: now() - 10 }))
    stubUpstream({ token: () => new Response('maintenance', { status: 503 }) })

    const response = await call('/api/plan', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(502)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })
})

describe('refreshing an access token', () => {
  it('stores the refreshed token for the next request', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10', { expiresAt: now() + 30 }))
    stubUpstream()

    expect((await call('/api/plan', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    const stored = await loadUser(env.COACH_CONFIG, SESSION_SECRET, 'i10')
    expect(stored?.tokens).toMatchObject({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' })
  })

  it('refreshes once when several requests arrive with the same expiring token', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10', { expiresAt: now() + 30 }))
    const calls = stubUpstream({
      token: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return json({ access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600 })
      },
    })

    const responses = await Promise.all(
      ['/api/plan', '/api/progress', '/api/sport-settings'].map((path) => call(path, { headers: { Cookie: cookie } }, env)),
    )
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(calls.filter((entry) => entry === 'POST /api/v1/oauth/token')).toHaveLength(1)
  })

  it('uses the token another request already stored when its own rotated refresh token is refused', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10', { expiresAt: now() + 30 }))
    const calls = stubUpstream({
      token: async () => {
        // Meanwhile another Worker instance refreshed and stored the rotated pair.
        await saveUser(env.COACH_CONFIG, SESSION_SECRET, {
          ...userOf('i10'),
          tokens: { accessToken: 'other-access', refreshToken: 'other-refresh', expiresAt: now() + 3600 },
        })
        return new Response('{"error":"invalid_grant"}', { status: 400 })
      },
    })

    const response = await call('/api/sport-settings', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(200)
    expect(calls).toContain('GET /api/v1/athlete/i10/sport-settings')
  })
})

describe('what reaches the browser when intervals.icu fails', () => {
  it('keeps the API key hint in single user mode, without the upstream body', async () => {
    const env = singleUserEnv(fakeKv())
    await env.COACH_CONFIG.put('athlete-config', JSON.stringify(DEFAULT_CONFIG))
    const login = await call('/api/login', { method: 'POST', body: JSON.stringify({ passwort: 'ein-langes-testpasswort' }) }, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0] ?? ''
    stubUpstream({ api: () => new Response(SECRET_BODY, { status: 401 }) })

    const response = await call('/api/sport-settings', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: string; needsLogin?: boolean }
    expect(body.error).toContain('API-Key')
    expect(body.error).not.toContain(SECRET_BODY)
    expect(body.needsLogin).toBeUndefined()
  })

  it.each([
    [500, 'nicht erreichbar'],
    [503, 'nicht erreichbar'],
    [429, 'drosselt'],
    [404, '404'],
  ])('says what a %i means and nothing more', async (status, words) => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubUpstream({ api: () => new Response(SECRET_BODY, { status }) })

    const response = await call('/api/sport-settings', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain(words)
    expect(body.error).not.toContain(SECRET_BODY)
    // The details are for the operator's logs.
    expect(errors.mock.calls.flat().join(' ')).toContain(SECRET_BODY)
    errors.mockRestore()
  })

  it('reports an unreachable intervals.icu instead of an internal error', async () => {
    const env = multiUserEnv()
    const cookie = await signedUp(env, userOf('i10'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubUpstream({ api: () => Promise.reject(new TypeError('network down')) })

    const response = await call('/api/sport-settings', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: string }).error).toContain('nicht erreichbar')
  })
})
