import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiRoutes } from '../server/routes.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import type { Execution } from '../src/coach/types.ts'
import { config } from './fixtures.ts'

const store: ConfigStore = { load: async () => config, save: async (next) => next }
const app = createApiRoutes(async () => ({
  auth: { kind: 'apiKey' as const, apiKey: 'unused', athleteId: 'i0' },
  store,
}))

const ftp = config.profile.sports.find((setting) => setting.sport === 'Ride')?.threshold
const watts = (percent: number) => Math.round(((ftp?.metric === 'power' ? ftp.ftp : 250) * percent) / 100)

/** What intervals.icu answers, keyed by the path the route asks for. */
const intervalsIcu = (responses: Record<string, unknown>) => {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    calls.push(`${path}${new URL(url).search}`)
    const body = Object.entries(responses).find(([prefix]) => path.startsWith(prefix))?.[1]
    return new Response(JSON.stringify(body ?? []), { status: body === undefined ? 404 : 200 })
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('the planned-against-done endpoint', () => {
  it('pairs the detected intervals with the template the athlete pushed', async () => {
    const calls = intervalsIcu({
      '/activity/i123/intervals': {
        icu_intervals: [
          { type: 'RECOVERY', moving_time: 900, average_watts: watts(60) },
          { type: 'WORK', moving_time: 720, average_watts: watts(106) },
          { type: 'RECOVERY', moving_time: 300, average_watts: watts(50) },
          { type: 'WORK', moving_time: 720, average_watts: watts(100) },
          { type: 'RECOVERY', moving_time: 300, average_watts: watts(50) },
          { type: 'WORK', moving_time: 720, average_watts: watts(99) },
        ],
      },
      '/activity/i123/streams.json': [
        { type: 'time', data: Array.from({ length: 3600 }, (_, second) => second) },
        { type: 'watts', data: Array(3600).fill(watts(100)) },
        { type: 'heartrate', data: Array(3600).fill(150) },
      ],
      '/activity/i123': { id: 'i123', type: 'Ride', icu_training_load: 86, compliance: 91 },
      '/athlete/i0/events': [],
    })

    const response = await app.request('/api/execution/i123?template=bike-thr-3x12&date=2026-09-23')
    const body = (await response.json()) as Execution

    expect(response.status).toBe(200)
    expect(body.steps.map((step) => step.verdict)).toEqual(['over', 'on', 'on'])
    expect(body.load.actual).toBe(86)
    expect(body.compliance).toBe(91)
    // The day's calendar is read, so a shortened push is compared as shortened.
    expect(calls.some((call) => call.includes('/events?oldest=2026-09-23&newest=2026-09-23'))).toBe(true)
  })

  it('draws the session over time from its streams, a few hundred points for an hour', async () => {
    intervalsIcu({
      '/activity/i5/intervals': { icu_intervals: [] },
      '/activity/i5/streams.json': [
        { type: 'time', data: Array.from({ length: 3600 }, (_, second) => second) },
        { type: 'watts', data: Array(3600).fill(watts(100)) },
      ],
      '/activity/i5': { id: 'i5', type: 'Ride', icu_training_load: 60 },
      '/athlete/i0/events': [],
    })
    const body = (await (await app.request('/api/execution/i5?template=bike-thr-3x12')).json()) as Execution
    expect(body.trace?.points.length).toBe(720)
    expect(body.trace?.points[100]?.percent).toBe(100)
  })

  it('still compares when the streams cannot be read', async () => {
    intervalsIcu({
      '/activity/i6/intervals': { icu_intervals: [{ type: 'WORK', moving_time: 720, average_watts: watts(100) }] },
      // Answered with a 404 by the stub.
      '/activity/i6/streams.json': undefined,
      '/activity/i6': { id: 'i6', type: 'Ride', icu_training_load: 60 },
    })
    const response = await app.request('/api/execution/i6?template=bike-thr-3x12')
    const body = (await response.json()) as Execution
    expect(response.status).toBe(200)
    expect(body.trace).toBeNull()
    expect(body.steps[0]?.verdict).toBe('on')
  })

  it('compares against the shortened version the calendar says was pushed', async () => {
    intervalsIcu({
      '/activity/i9/intervals': { icu_intervals: [] },
      '/activity/i9': { id: 'i9', type: 'Ride', icu_training_load: 50 },
      '/athlete/i0/events': [
        {
          id: 'e1',
          category: 'WORKOUT',
          start_date_local: '2026-09-23T00:00:00',
          name: 'Schwelle 3x12min (45 min)',
          external_id: 'coach:2026-09-23:bike-thr-3x12:45',
        },
      ],
    })
    const body = (await (
      await app.request('/api/execution/i9?template=bike-thr-3x12&date=2026-09-23')
    ).json()) as Execution
    // Fewer intervals than the full three: the trim is what was asked for.
    expect(body.steps.length).toBeLessThan(3)
  })

  it('rejects an activity id that would become a different path', async () => {
    intervalsIcu({})
    const response = await app.request('/api/execution/..%2Fathlete?template=bike-thr-3x12')
    expect(response.status).toBe(400)
  })

  it('has nothing to compare for a race or an unknown template', async () => {
    intervalsIcu({})
    expect((await app.request('/api/execution/i1?template=zrl-race')).status).toBe(404)
    expect((await app.request('/api/execution/i1?template=gibt-es-nicht')).status).toBe(404)
  })
})
