import { describe, expect, it } from 'vitest'
import { app } from '../worker/index.ts'
import { fakeKv, multiUserEnv } from './worker-fakes.ts'

const request = (url: string) => Promise.resolve(app.request(url, {}, multiUserEnv(fakeKv())))

describe('canonical host', () => {
  it('moves a www. request to the bare host, keeping path and query', async () => {
    const response = await request('https://www.formkurve.org/auth/login?consent=1')
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe('https://formkurve.org/auth/login?consent=1')
  })

  it('leaves the bare host and other subdomains alone', async () => {
    expect((await request('https://formkurve.org/healthz')).status).toBe(200)
    expect((await request('https://demo.formkurve.org/healthz')).status).toBe(200)
  })
})
