import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../worker/index.ts'
import type { Bindings, KVNamespace } from '../worker/bindings.ts'
import { MAX_SIGNUPS, isEmail, requestDoubleOptIn } from '../worker/waitlist.ts'

const fakeKv = (): KVNamespace => {
  const store = new Map<string, string>()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value)
    },
    delete: async (key) => {
      store.delete(key)
    },
    list: async () => ({ keys: [], list_complete: true }),
  }
}

const env = (brevo = true): Bindings => ({
  ASSETS: { fetch: async () => new Response('shell') },
  COACH_CONFIG: fakeKv(),
  INTERVALS_API_KEY: 'key',
  INTERVALS_ATHLETE_ID: 'i123',
  APP_PASSWORD: 'ein-langes-testpasswort',
  ...(brevo ? { BREVO_API_KEY: 'brevo-key', BREVO_LIST_ID: '7', BREVO_DOI_TEMPLATE_ID: '3' } : {}),
})

const signUp = (bindings: Bindings, body: Record<string, unknown>) =>
  app.request('https://formkurve.test/api/waitlist', { method: 'POST', body: JSON.stringify(body) }, bindings)

const config = { apiKey: 'k', listId: 7, templateId: 3, redirectionUrl: 'https://formkurve.test/warteliste/bestaetigt' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the confirmation request', () => {
  it('asks Brevo for a double opt-in into the list, returning to the thank-you page', async () => {
    const send = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await requestDoubleOptIn(config, 'a@b.de', send as unknown as typeof fetch)).toBe('sent')
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/contacts/doubleOptinConfirmation')
    expect((init.headers as Record<string, string>)['api-key']).toBe('k')
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'a@b.de',
      includeListIds: [7],
      templateId: 3,
      redirectionUrl: 'https://formkurve.test/warteliste/bestaetigt',
    })
  })

  it('does not reveal that an address is already on the list', async () => {
    const send = async () => new Response(JSON.stringify({ code: 'duplicate_parameter' }), { status: 400 })
    expect(await requestDoubleOptIn(config, 'a@b.de', send as unknown as typeof fetch)).toBe('sent')
  })

  it('reports any other refusal as a failure', async () => {
    const send = async () => new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 })
    expect(await requestDoubleOptIn(config, 'a@b.de', send as unknown as typeof fetch)).toBe('failed')
  })
})

describe('the waitlist route', () => {
  it('is open without a session and passes the address on', async () => {
    const brevo = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }))
    const response = await signUp(env(), { email: ' laeufer@example.de ' })
    expect(response.status).toBe(200)
    expect(JSON.parse(String(brevo.mock.calls[0]?.[1]?.body)).email).toBe('laeufer@example.de')
  })

  it('says so while Brevo is not set up', async () => {
    expect((await signUp(env(false), { email: 'a@b.de' })).status).toBe(503)
  })

  it('refuses what is not an address', async () => {
    expect((await signUp(env(), { email: 'kein-at-zeichen' })).status).toBe(400)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('vor.name@sub.example.de')).toBe(true)
  })

  it('answers a filled honeypot like a success and sends nothing', async () => {
    const brevo = vi.spyOn(globalThis, 'fetch')
    expect((await signUp(env(), { email: 'a@b.de', website: 'spam' })).status).toBe(200)
    expect(brevo).not.toHaveBeenCalled()
  })

  it('limits attempts per client', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 201 }))
    const bindings = env()
    for (let attempt = 0; attempt < MAX_SIGNUPS; attempt += 1) {
      expect((await signUp(bindings, { email: `a${attempt}@b.de` })).status).toBe(200)
    }
    expect((await signUp(bindings, { email: 'z@b.de' })).status).toBe(429)
  })
})
