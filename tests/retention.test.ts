import { describe, expect, it } from 'vitest'
import {
  RETENTION_SECONDS,
  deleteUser,
  loadUser,
  needsTouch,
  saveUser,
  touchUser,
  userConfigStore,
} from '../worker/users.ts'
import type { User } from '../worker/users.ts'
import type { KVNamespace, KVPutOptions } from '../worker/bindings.ts'
import { config } from './fixtures.ts'

type Entry = { readonly value: string; readonly ttl: number | undefined }

const fakeKv = () => {
  const store = new Map<string, Entry>()
  const namespace: KVNamespace = {
    get: async (key) => store.get(key)?.value ?? null,
    put: async (key: string, value: string, options?: KVPutOptions) => {
      store.set(key, { value, ttl: options?.expirationTtl })
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  }
  return { namespace, store }
}

const SECRET = 'test-secret-for-retention'

const user = (overrides: Partial<User> = {}): User => ({
  athleteId: 'i123',
  name: 'Testathlet',
  tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: 0 },
  createdAt: '2026-01-01T00:00:00.000Z',
  consentAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

/**
 * The privacy notice promises erasure twelve months after the last visit. Nothing
 * sweeps the store, so these are the tests that keep the promise honest.
 */
describe('retention', () => {
  it('gives every account key a twelve month lifetime', async () => {
    const { namespace, store } = fakeKv()
    await saveUser(namespace, SECRET, user())
    expect(store.get('user:i123')?.ttl).toBe(RETENTION_SECONDS)
    expect(RETENTION_SECONDS).toBe(365 * 24 * 60 * 60)
  })

  it('gives the configuration the same lifetime', async () => {
    const { namespace, store } = fakeKv()
    await userConfigStore(namespace, 'i123').save(config)
    expect(store.get('config:i123')?.ttl).toBe(RETENTION_SECONDS)
  })

  it('renews both lifetimes on a visit, so an account in use never expires', async () => {
    const { namespace, store } = fakeKv()
    await userConfigStore(namespace, 'i123').save(config)
    store.set('config:i123', { value: store.get('config:i123')?.value ?? '', ttl: 60 })

    await touchUser(namespace, SECRET, user())

    expect(store.get('user:i123')?.ttl).toBe(RETENTION_SECONDS)
    expect(store.get('config:i123')?.ttl).toBe(RETENTION_SECONDS)
  })

  it('writes at most once a week, not once a request', () => {
    const day = 24 * 60 * 60 * 1000
    const now = Date.parse('2026-02-01T00:00:00.000Z')
    expect(needsTouch(user({ lastSeenAt: '2026-01-31T00:00:00.000Z' }), now)).toBe(false)
    expect(needsTouch(user({ lastSeenAt: new Date(now - 8 * day).toISOString() }), now)).toBe(true)
  })

  it('leaves nothing behind when the athlete deletes the account', async () => {
    const { namespace, store } = fakeKv()
    await saveUser(namespace, SECRET, user())
    await userConfigStore(namespace, 'i123').save(config)

    await deleteUser(namespace, 'i123')

    expect(store.size).toBe(0)
    expect(await loadUser(namespace, SECRET, 'i123')).toBeNull()
  })

  it('records when consent was given, so it can be proven later', async () => {
    const { namespace } = fakeKv()
    await saveUser(namespace, SECRET, user({ consentAt: '2026-03-04T10:00:00.000Z' }))
    const stored = await loadUser(namespace, SECRET, 'i123')
    expect(stored?.consentAt).toBe('2026-03-04T10:00:00.000Z')
  })
})
