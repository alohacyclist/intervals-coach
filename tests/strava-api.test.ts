import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStrava } from '../src/ui/api.ts'

afterEach(() => vi.unstubAllGlobals())

describe('asking whether Strava is connected', () => {
  it('treats a page that is not an answer as Strava not being set up', async () => {
    // What a static host or the dev server sends for an unknown path: the app shell, status 200.
    vi.stubGlobal('fetch', async () => new Response('<!doctype html><html></html>', { status: 200 }))
    expect(await getStrava(true)).toEqual({ available: false, connected: false, name: null, posted: [] })
  })

  it('passes a real answer through', async () => {
    const status = { available: true, connected: true, name: 'Christian M', posted: ['i77'] }
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(status), { status: 200 }))
    expect(await getStrava(true)).toEqual(status)
  })
})
