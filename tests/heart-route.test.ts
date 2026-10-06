import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiRoutes } from '../server/routes.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import type { Execution } from '../src/coach/types.ts'
import { config } from './fixtures.ts'

const store: ConfigStore = { load: async () => config, save: async (next) => next }
const withKey = createApiRoutes(async () => ({
  auth: { kind: 'apiKey' as const, apiKey: 'unused', athleteId: 'i0' },
  store,
}))
const withToken = createApiRoutes(async () => ({
  auth: { kind: 'bearer' as const, accessToken: 'unused', athleteId: 'i0' },
  store,
}))

const FTP = 280

/** Warm-up, three threshold blocks with recoveries, cool-down — as share of FTP per second. */
const effort = [
  [900, 60],
  [720, 102],
  [300, 52],
  [720, 102],
  [300, 52],
  [720, 102],
  [600, 52],
].flatMap(([seconds, percent]) => Array.from({ length: seconds! }, (_, second) => percent! + 4 * Math.sin(second * 1.3)))

/** A heart that rises faster than it falls; the watch reads it 30 beats low through the second block. */
const truth = (() => {
  let heart = 80
  return effort.map((percent, second) => {
    const target = 85 + 0.95 * percent
    heart += (target - heart) / (target > heart ? 30 : 60)
    return Math.round(heart + (6 * second) / 3600 + Math.sin(second))
  })
})()
const recorded = truth.map((beat, second) => (second >= 1900 && second < 2700 ? beat - 30 : beat))

type Call = { readonly method: string; readonly path: string; readonly body: unknown }

/** intervals.icu as the route sees it; `refuse` answers the stream upload with that status. */
const intervalsIcu = (activityId: string, heartRate: readonly number[], refuse?: number) => {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    const method = init?.method ?? 'GET'
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
    const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    if (method === 'PUT' && path === `/activity/${activityId}/streams`) {
      return refuse ? answer({ error: 'no' }, refuse) : answer({ updated: ['heartrate'], deleted: [] })
    }
    if (method === 'POST' && path === `/activity/${activityId}/messages`) return answer({ id: 1 })
    if (path === `/activity/${activityId}/streams.json`) {
      return answer([
        { type: 'time', data: effort.map((_, second) => second) },
        { type: 'watts', data: effort.map((percent) => Math.round((percent * FTP) / 100)) },
        { type: 'heartrate', data: heartRate },
      ])
    }
    if (path === `/activity/${activityId}/intervals`) return answer({ icu_intervals: [] })
    if (path === `/activity/${activityId}`) return answer({ id: activityId, type: 'Ride', icu_training_load: 80 })
    return answer([])
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

const shown = async (app: typeof withKey, activityId: string): Promise<Execution> =>
  (await (await app.request(`/api/execution/${activityId}?template=bike-thr-3x12&date=2026-10-06`)).json()) as Execution

const confirm = (app: typeof withKey, activityId: string, expected: unknown) =>
  app.request(`/api/execution/${activityId}/heart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: 'bike-thr-3x12', date: '2026-10-06', expected }),
  })

describe('writing the estimated heart rate back to intervals.icu', () => {
  it('offers it under the session with an API key, and writes only the heart rate, sample for sample', async () => {
    const calls = intervalsIcu('i7', recorded)
    const { heart } = await shown(withKey, 'i7')
    expect(heart?.writable).toBe(true)

    const response = await confirm(withKey, 'i7', {
      faultySeconds: heart!.faultySeconds,
      correctedAverage: heart!.correctedAverage,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'written', noted: true })

    const upload = calls.find((call) => call.method === 'PUT')!
    expect(upload.path).toBe('/activity/i7/streams')
    const [stream] = upload.body as { type: string; data: number[] }[]
    expect(stream!.type).toBe('heartrate')
    expect(stream!.data).toHaveLength(recorded.length)
    // The clean recording is left exactly as it was.
    expect(stream!.data.slice(0, 1800)).toEqual(recorded.slice(0, 1800))
    expect(stream!.data.slice(2800)).toEqual(recorded.slice(2800))
    // The faulty stretch now reads close to what the heart did.
    const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(Math.abs(mean(stream!.data.slice(2000, 2600)) - mean(truth.slice(2000, 2600)))).toBeLessThan(5)

    const note = calls.find((call) => call.method === 'POST')!
    expect(note.path).toBe('/activity/i7/messages')
    expect((note.body as { content: string }).content).toMatch(/^Puls von Formkurve korrigiert: \d+ min/)
  })

  it('writes nothing when the recording is no longer the one the athlete confirmed', async () => {
    const calls = intervalsIcu('i8', recorded)
    const { heart } = await shown(withKey, 'i8')
    const response = await confirm(withKey, 'i8', {
      faultySeconds: heart!.faultySeconds + 60,
      correctedAverage: heart!.correctedAverage,
    })
    expect(response.status).toBe(409)
    expect(calls.some((call) => call.method !== 'GET')).toBe(false)
  })

  it('writes nothing over a clean recording', async () => {
    const calls = intervalsIcu('i9', truth)
    expect((await shown(withKey, 'i9')).heart).toBeUndefined()
    const response = await confirm(withKey, 'i9', { faultySeconds: 600, correctedAverage: 150 })
    expect(response.status).toBe(409)
    expect(calls.some((call) => call.method !== 'GET')).toBe(false)
  })

  it('says why when intervals.icu refuses the upload', async () => {
    intervalsIcu('i10', recorded, 403)
    const { heart } = await shown(withKey, 'i10')
    const response = await confirm(withKey, 'i10', {
      faultySeconds: heart!.faultySeconds,
      correctedAverage: heart!.correctedAverage,
    })
    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: string }).error).toContain('Supporter')
  })

  it('is not offered under OAuth, whose grant does not ask to write activities', async () => {
    const calls = intervalsIcu('i11', recorded)
    const { heart } = await shown(withToken, 'i11')
    expect(heart?.message).toContain('Pulsaufzeichnung gestört')
    expect(heart?.writable).toBeUndefined()
    const response = await confirm(withToken, 'i11', {
      faultySeconds: heart!.faultySeconds,
      correctedAverage: heart!.correctedAverage,
    })
    expect(response.status).toBe(403)
    expect(calls.some((call) => call.method !== 'GET')).toBe(false)
  })
})
