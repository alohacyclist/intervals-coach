import { describe, expect, it } from 'vitest'
import { call, fakeKv, multiUserEnv, singleUserEnv } from './worker-fakes.ts'

describe('public health check', () => {
  it('answers without a session and without touching any athlete data', async () => {
    const kv = fakeKv()
    const response = await call('/healthz', {}, multiUserEnv(kv))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, version: null })
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(kv.store.size).toBe(0)
  })

  it('names the deployed version when Cloudflare provides it', async () => {
    const env = singleUserEnv(fakeKv(), { CF_VERSION_METADATA: { id: 'abc-123', tag: 'v7', timestamp: '2026-09-29' } })
    expect(await (await call('/healthz', {}, env)).json()).toEqual({ ok: true, version: 'abc-123' })
  })

  it('reports a deployment that is missing its secrets as down, without saying which ones', async () => {
    const env = { ASSETS: { fetch: async () => new Response('shell') }, COACH_CONFIG: fakeKv().namespace }
    const response = await call('/healthz', {}, env)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, version: null })
  })

  it('keeps the detailed health route behind the session', async () => {
    expect((await call('/api/health', {}, multiUserEnv())).status).toBe(401)
  })
})
