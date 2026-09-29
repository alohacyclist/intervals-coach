import { app } from '../worker/index.ts'
import type { Bindings, KVNamespace, KVPutOptions } from '../worker/bindings.ts'
import { createSessionCookie } from '../worker/session.ts'

export type FakeKv = {
  readonly namespace: KVNamespace
  readonly store: Map<string, { readonly value: string; readonly options: KVPutOptions | undefined }>
}

export const fakeKv = (): FakeKv => {
  const store = new Map<string, { readonly value: string; readonly options: KVPutOptions | undefined }>()
  const namespace: KVNamespace = {
    get: async (key) => store.get(key)?.value ?? null,
    put: async (key, value, options) => {
      store.set(key, { value, options })
    },
    delete: async (key) => {
      store.delete(key)
    },
    list: async ({ prefix }) => ({
      keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    }),
  }
  return { namespace, store }
}

export const SESSION_SECRET = 'session-secret'
export const PASSWORD = 'ein-langes-testpasswort'

export const multiUserEnv = (kv: FakeKv = fakeKv(), extra: Partial<Bindings> = {}): Bindings => ({
  ASSETS: { fetch: async () => new Response('shell') },
  COACH_CONFIG: kv.namespace,
  INTERVALS_CLIENT_ID: 'client',
  INTERVALS_CLIENT_SECRET: 'secret',
  SESSION_SECRET,
  ...extra,
})

export const singleUserEnv = (kv: FakeKv = fakeKv(), extra: Partial<Bindings> = {}): Bindings => ({
  ASSETS: { fetch: async () => new Response('shell') },
  COACH_CONFIG: kv.namespace,
  INTERVALS_API_KEY: 'key',
  INTERVALS_ATHLETE_ID: 'i1',
  APP_PASSWORD: PASSWORD,
  ...extra,
})

export const call = (path: string, init: RequestInit, env: Bindings): Promise<Response> =>
  Promise.resolve(app.request(`https://coach.test${path}`, init, env))

/** The Set-Cookie value reduced to what a browser would send back. */
export const cookieOf = (setCookie: string): string => setCookie.split(';')[0] ?? ''

export const sessionFor = async (athleteId: string, secret: string = SESSION_SECRET): Promise<string> =>
  cookieOf(await createSessionCookie(athleteId, secret, true))

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
