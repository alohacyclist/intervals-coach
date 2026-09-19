import { describe, expect, it } from 'vitest'
import app from '../worker/index.ts'
import type { Bindings, KVNamespace, KVPutOptions } from '../worker/bindings.ts'
import { MAX_ATTEMPTS } from '../worker/login-throttle.ts'
import { sign } from '../worker/crypto.ts'

const fakeKv = (): KVNamespace => {
  const store = new Map<string, string>()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key: string, value: string, _options?: KVPutOptions) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  }
}

const PASSWORD = 'ein-langes-testpasswort'

const singleUserEnv = (): Bindings => ({
  ASSETS: { fetch: async () => new Response('shell', { status: 200 }) },
  COACH_CONFIG: fakeKv(),
  INTERVALS_API_KEY: 'key',
  INTERVALS_ATHLETE_ID: 'i123',
  APP_PASSWORD: PASSWORD,
})

const call = async (path: string, init: RequestInit, env: Bindings): Promise<Response> =>
  app.request(`https://coach.test${path}`, init, env)

const login = (env: Bindings, passwort: string = PASSWORD): Promise<Response> =>
  call('/api/login', { method: 'POST', body: JSON.stringify({ passwort }) }, env)

/** The Set-Cookie value reduced to what a browser would send back. */
const cookieFrom = (response: Response): string => (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? ''

describe('single user sign in', () => {
  it('refuses the API without a session and says a login is needed', async () => {
    const response = await call('/api/plan?days=3', {}, singleUserEnv())
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ needsLogin: true })
  })

  it('serves the app shell and legal pages without a session', async () => {
    const env = singleUserEnv()
    for (const path of ['/', '/datenschutz', '/assets/app.js']) {
      expect((await call(path, {}, env)).status).toBe(200)
    }
  })

  it('reports an unauthenticated single user setup', async () => {
    const response = await call('/api/me', {}, singleUserEnv())
    expect(await response.json()).toEqual({ mode: 'single', authenticated: false, onboarded: true })
  })

  it('exchanges the password for a session cookie', async () => {
    const env = singleUserEnv()
    const response = await login(env)
    expect(response.status).toBe(200)

    const setCookie = response.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain('coach_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')
    // At least a week of not logging in again — thirty days, to be exact.
    expect(setCookie).toContain(`Max-Age=${60 * 60 * 24 * 30}`)
  })

  it('accepts the session cookie on later requests', async () => {
    const env = singleUserEnv()
    const cookie = cookieFrom(await login(env))
    const response = await call('/api/me', { headers: { Cookie: cookie } }, env)
    expect(await response.json()).toMatchObject({ authenticated: true })
  })

  it('rejects a wrong password and a cookie signed with another password', async () => {
    const env = singleUserEnv()
    expect((await login(env, 'falsch')).status).toBe(401)

    const cookie = cookieFrom(await login(env))
    const other: Bindings = { ...singleUserEnv(), APP_PASSWORD: 'ein-anderes-passwort' }
    const response = await call('/api/me', { headers: { Cookie: cookie } }, other)
    expect(await response.json()).toMatchObject({ authenticated: false })
  })

  it('blocks guessing after ten failures and keeps blocking the right password', async () => {
    const env = singleUserEnv()
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      expect((await login(env, 'falsch')).status).toBe(401)
    }
    expect((await login(env, 'falsch')).status).toBe(429)
    expect((await login(env)).status).toBe(429)
  })

  it('pushes the expiry back out while the app is in use', async () => {
    const env = singleUserEnv()
    const thirtyDays = 60 * 60 * 24 * 30
    const aged = async (ageSeconds: number): Promise<string> => {
      const exp = Math.floor(Date.now() / 1000) + thirtyDays - ageSeconds
      const payload = btoa(JSON.stringify({ athleteId: 'einzelbetrieb', exp }))
      return `coach_session=${payload}.${await sign(payload, PASSWORD)}`
    }

    const fresh = await call('/api/me', { headers: { Cookie: await aged(60) } }, env)
    expect(fresh.headers.get('Set-Cookie')).toBeNull()

    const old = await call('/api/me', { headers: { Cookie: await aged(60 * 60 * 48) } }, env)
    expect(old.headers.get('Set-Cookie')).toContain(`Max-Age=${thirtyDays}`)
  })

  it('clears the cookie on logout', async () => {
    const response = await call('/auth/logout', {}, singleUserEnv())
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
  })

  it('drops Secure over plain http, so wrangler dev on localhost can sign in', async () => {
    const env = singleUserEnv()
    const response = await app.request(
      'http://localhost:8787/api/login',
      { method: 'POST', body: JSON.stringify({ passwort: PASSWORD }) },
      env,
    )
    expect(response.headers.get('Set-Cookie')).not.toContain('Secure')
  })

  it('refuses everything when nothing is configured', async () => {
    const env: Bindings = { ASSETS: { fetch: async () => new Response('shell') }, COACH_CONFIG: fakeKv() }
    expect((await call('/api/plan', {}, env)).status).toBe(500)
  })
})

describe('multi user mode', () => {
  const multiEnv = (): Bindings => ({
    ASSETS: { fetch: async () => new Response('shell') },
    COACH_CONFIG: fakeKv(),
    INTERVALS_CLIENT_ID: 'client',
    INTERVALS_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'session-secret',
  })

  it('has no password login', async () => {
    expect((await login(multiEnv())).status).toBe(400)
  })

  it('still gates the API behind a session', async () => {
    const response = await call('/api/plan?days=3', {}, multiEnv())
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ needsLogin: true })
  })
})
