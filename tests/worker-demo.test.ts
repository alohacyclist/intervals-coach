import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../worker/index.ts'
import type { Bindings } from '../worker/bindings.ts'
import { createSessionCookie } from '../worker/session.ts'
import { MAX_ATTEMPTS } from '../worker/login-throttle.ts'
import { SANDBOX_SECONDS } from '../worker/demo.ts'
import { cookieOf, fakeKv } from './worker-fakes.ts'
import type { FakeKv } from './worker-fakes.ts'

/**
 * The demo end to end, through the Worker's own entry point — the one
 * Cloudflare calls — so the switch between the real app and the demo is part
 * of what is tested.
 */
const DEMO_PASSWORD = 'demo-passwort-fuer-bewerbungen'

const demoEnv = (kv: FakeKv = fakeKv(), extra: Partial<Bindings> = {}): Bindings => ({
  ASSETS: { fetch: async () => new Response('shell') },
  COACH_CONFIG: kv.namespace,
  DEMO_MODE: 'on',
  DEMO_PASSWORD,
  ...extra,
})

const execution = { waitUntil: vi.fn(), passThroughOnException: () => {}, props: {} }

const call = (path: string, init: RequestInit, env: Bindings): Promise<Response> =>
  Promise.resolve(worker.fetch(new Request(`https://demo.test${path}`, init), env, execution as never))

const signIn = async (env: Bindings, passwort = DEMO_PASSWORD): Promise<Response> =>
  call('/api/login', { method: 'POST', body: JSON.stringify({ passwort }), headers: { 'CF-Connecting-IP': '203.0.113.7' } }, env)

const sessionOf = async (env: Bindings): Promise<string> => cookieOf((await signIn(env)).headers.get('Set-Cookie') ?? '')

afterEach(() => {
  vi.unstubAllGlobals()
  execution.waitUntil.mockClear()
})

describe('demo sign in', () => {
  it('says it is the demo and asks for the password before any data', async () => {
    const env = demoEnv()
    expect(await (await call('/api/me', {}, env)).json()).toEqual({ mode: 'demo', authenticated: false, onboarded: true })
    const plan = await call('/api/plan', {}, env)
    expect(plan.status).toBe(401)
    expect(await plan.json()).toMatchObject({ needsLogin: true })
  })

  it('serves the app shell without a session, so the login page can load', async () => {
    expect(await (await call('/app', {}, demoEnv())).text()).toBe('shell')
  })

  it('refuses a wrong password and blocks guessing', async () => {
    const env = demoEnv()
    expect((await signIn(env, 'falsch')).status).toBe(401)
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) await signIn(env, 'falsch')
    expect((await signIn(env)).status).toBe(429)
  })

  it('opens the plan on synthetic data with the password, without a single request to intervals.icu', async () => {
    const network = vi.fn(async () => new Response('nein', { status: 500 }))
    vi.stubGlobal('fetch', network)
    const env = demoEnv()
    const cookie = await sessionOf(env)

    expect(await (await call('/api/me', { headers: { Cookie: cookie } }, env)).json()).toMatchObject({
      mode: 'demo',
      authenticated: true,
    })
    const plan = await call('/api/plan', { headers: { Cookie: cookie } }, env)
    expect(plan.status).toBe(200)
    expect(((await plan.json()) as { days: unknown[] }).days).toHaveLength(3)
    expect((await call('/api/progress', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    expect(network).not.toHaveBeenCalled()
  })

  it('ends the session on logout', async () => {
    const response = await call('/auth/logout', {}, demoEnv())
    expect(response.status).toBe(302)
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/)
  })
})

describe('demo sandbox', () => {
  it('gives every visitor their own copy, kept two hours after the last change', async () => {
    const kv = fakeKv()
    const env = demoEnv(kv)
    const first = await sessionOf(env)
    const second = await sessionOf(env)
    expect(first).not.toBe(second)

    const declared = await call('/api/break', { method: 'POST', headers: { Cookie: first }, body: JSON.stringify({ kind: 'pause', days: 5 }) }, env)
    expect(declared.status).toBe(200)

    const breaksOf = async (cookie: string) =>
      ((await (await call('/api/config', { headers: { Cookie: cookie } }, env)).json()) as { breaks: { kind: string }[] }).breaks.map((entry) => entry.kind)
    expect(await breaksOf(first)).toContain('pause')
    expect(await breaksOf(second)).not.toContain('pause')

    const sandboxes = [...kv.store.entries()].filter(([key]) => key.startsWith('demo-sandbox:'))
    expect(sandboxes.length).toBeGreaterThan(0)
    for (const [, entry] of sandboxes) expect(entry.options?.expirationTtl).toBe(SANDBOX_SECONDS)
    expect(SANDBOX_SECONDS).toBe(2 * 60 * 60)
  })

  it('starts from the fixtures again once the sandbox has expired', async () => {
    const kv = fakeKv()
    const env = demoEnv(kv)
    const cookie = await sessionOf(env)
    await call('/api/break', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ kind: 'pause', days: 5 }) }, env)
    // What KV does on its own when the time is up.
    for (const key of [...kv.store.keys()].filter((name) => name.startsWith('demo-sandbox:'))) kv.store.delete(key)
    const config = (await (await call('/api/config', { headers: { Cookie: cookie } }, env)).json()) as { breaks: { kind: string }[] }
    expect(config.breaks.map((entry) => entry.kind)).toEqual(['illness'])
  })

  it('keeps everything that is not about the plan out of reach', async () => {
    const env = demoEnv()
    const cookie = await sessionOf(env)
    expect((await call('/api/strava', { headers: { Cookie: cookie } }, env)).status).toBe(404)
    expect((await call('/api/account', { method: 'DELETE', headers: { Cookie: cookie } }, env)).status).toBe(404)
    expect((await call('/auth/login?einwilligung=ja', {}, env)).headers.get('Location')).toBe('/')
  })
})

describe('demo separation', () => {
  it.each([
    ['INTERVALS_API_KEY', 'key'],
    ['INTERVALS_ATHLETE_ID', 'i1'],
    ['INTERVALS_CLIENT_ID', 'client'],
    ['INTERVALS_CLIENT_SECRET', 'secret'],
    ['APP_PASSWORD', 'pw'],
    ['STRAVA_CLIENT_ID', '1'],
    ['STRAVA_CLIENT_SECRET', 's'],
  ])('refuses to run next to %s and names it', async (name, value) => {
    const response = await call('/api/me', {}, demoEnv(fakeKv(), { [name]: value }))
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain(name)
    expect(text).not.toContain(value === 'key' ? 'key,' : `=${value}`)
  })

  it('refuses to run without a demo password', async () => {
    const response = await call('/api/me', {}, demoEnv(fakeKv(), { DEMO_PASSWORD: undefined }))
    expect(response.status).toBe(500)
    expect(await response.text()).toContain('DEMO_PASSWORD')
  })

  it('does not take a cookie that is not a demo session, even signed with the same secret', async () => {
    const env = demoEnv()
    const foreign = cookieOf(await createSessionCookie('einzelbetrieb', DEMO_PASSWORD, true))
    expect((await call('/api/plan', { headers: { Cookie: foreign } }, env)).status).toBe(401)
  })

  it('runs no cron', () => {
    worker.scheduled({}, demoEnv(), execution as never)
    expect(execution.waitUntil).not.toHaveBeenCalled()
  })

  it('leaves the real app as it was when the demo is off', async () => {
    const env: Bindings = {
      ASSETS: { fetch: async () => new Response('shell') },
      COACH_CONFIG: fakeKv().namespace,
      INTERVALS_API_KEY: 'key',
      INTERVALS_ATHLETE_ID: 'i1',
      APP_PASSWORD: 'ein-langes-testpasswort',
      DEMO_PASSWORD,
    }
    expect(await (await call('/api/me', {}, env)).json()).toMatchObject({ mode: 'single' })
    expect((await signIn(env)).status).toBe(401)
  })
})
