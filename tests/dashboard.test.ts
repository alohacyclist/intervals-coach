import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeSteady, BLOCK_BATCH, buildDashboardSummary, buildWeeks, isSteadyCandidate } from '../src/coach/dashboard.ts'
import type { BlockReading, DashboardSummary } from '../src/coach/dashboard.ts'
import type { SteadyBlock } from '../src/coach/steady-block.ts'
import type { Activity, RideStats } from '../src/coach/types.ts'
import { mapRideStats } from '../server/intervals.ts'
import { createApiRoutes } from '../server/routes.ts'
import { httpSource } from '../server/source.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { activity, config, TODAY } from './fixtures.ts'

const stats = (overrides: Partial<RideStats> = {}): RideStats => ({
  averageWatts: 200,
  normalizedWatts: 204,
  efficiencyFactor: 1.45,
  variabilityIndex: 1.02,
  decouplingPct: 3.1,
  indoor: true,
  ...overrides,
})

const ride = (daysAgo: number, overrides: Partial<Activity> = {}): Activity =>
  activity(daysAgo, 'Ride', { id: `r${daysAgo}`, rideStats: stats(), ...overrides })

const block = (first: number, second: number, watts = 200): SteadyBlock => ({
  startS: 600,
  durationS: 2400,
  avgWatts: watts,
  avgHeartRate: watts * first,
  firstHalfHrPerW: first,
  secondHalfHrPerW: second,
})

const read = (id: string, b: SteadyBlock | null): [string, BlockReading] => [
  id,
  { id, status: b ? 'block' : 'noBlock', block: b },
]

describe('mapRideStats', () => {
  it('reads the fields of the official Activity schema', () => {
    const raw = {
      type: 'Ride',
      trainer: true,
      icu_average_watts: 190,
      icu_weighted_avg_watts: 201,
      icu_efficiency_factor: 1.4,
      icu_variability_index: 1.06,
      decoupling: 4.2,
    }
    expect(mapRideStats(raw)).toEqual({
      averageWatts: 190,
      normalizedWatts: 201,
      efficiencyFactor: 1.4,
      variabilityIndex: 1.06,
      decouplingPct: 4.2,
      indoor: true,
    })
  })

  it('counts a virtual ride as indoor and skips rides without power and other sports', () => {
    expect(mapRideStats({ type: 'VirtualRide', icu_average_watts: 180 })?.indoor).toBe(true)
    expect(mapRideStats({ type: 'Ride', icu_average_watts: 180 })?.indoor).toBe(false)
    expect(mapRideStats({ type: 'Ride' })).toBeNull()
    expect(mapRideStats({ type: 'Run', icu_average_watts: 250 })).toBeNull()
  })
})

describe('isSteadyCandidate', () => {
  it('keeps long rides with power, whatever their evenness', () => {
    expect(isSteadyCandidate(ride(1))).toBe(true)
    // Outdoors a 30 minute block fits into a ride with a high VI too.
    expect(isSteadyCandidate(ride(1, { rideStats: stats({ variabilityIndex: 1.25 }) }))).toBe(true)
    expect(isSteadyCandidate(ride(1, { movingTimeSec: 2300 }))).toBe(false)
    expect(isSteadyCandidate(ride(1, { rideStats: null }))).toBe(false)
    expect(isSteadyCandidate(ride(1, { source: 'STRAVA', load: 0 }))).toBe(false)
    expect(isSteadyCandidate(activity(1, 'Run'))).toBe(false)
  })
})

describe('buildWeeks', () => {
  it('sums rides per Monday week and keeps the four weeks before as chronic mean', () => {
    const weeks = buildWeeks([ride(0, { load: 50 }), ride(1, { load: 30 }), ride(9, { load: 40 }), activity(0, 'Run')], TODAY, 2)
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-24', '2026-08-31'])
    expect(weeks[1]).toMatchObject({ rides: 2, load: 80, seconds: 7200, workKj: 1440, partial: true, loadChronic: 10 })
    expect(weeks[0]?.partial).toBe(false)
  })

  it('averages efficiency over even rides only', () => {
    const [week] = buildWeeks(
      [ride(0, { rideStats: stats({ efficiencyFactor: 1.5 }) }), ride(1, { rideStats: stats({ efficiencyFactor: 1.1, variabilityIndex: 1.2 }) })],
      TODAY,
      1,
    )
    expect(week?.efficiencyFactor).toBe(1.5)
  })
})

describe('buildDashboardSummary', () => {
  it('lists shown candidates first, then the baseline window, and counts Strava stubs', () => {
    const summary = buildDashboardSummary(
      [ride(1), ride(20), ride(0, { id: 'stub', source: 'STRAVA', load: 0 }), ride(2, { movingTimeSec: 1200 })],
      TODAY,
      1,
    )
    expect(summary.candidates.map((c) => [c.id, c.shown])).toEqual([
      ['r1', true],
      ['r20', false],
    ])
    expect(summary.rides.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(summary.stravaStubs).toBe(1)
  })

  it('hides whole-ride efficiency and decoupling of uneven rides', () => {
    const summary = buildDashboardSummary([ride(1, { rideStats: stats({ variabilityIndex: 1.08 }) })], TODAY, 1)
    expect(summary.rides[0]).toMatchObject({ efficiencyFactor: null, decouplingPct: null, variabilityIndex: 1.08 })
  })
})

describe('analyzeSteady', () => {
  const summaryOf = (rides: Activity[], weeks = 2): DashboardSummary => buildDashboardSummary(rides, TODAY, weeks)

  it('finds drift and tells calm rides from rides without a block', () => {
    const summary = summaryOf([ride(1, { id: 'drift' }), ride(2, { id: 'flat' }), ride(3, { id: 'intervals' })])
    const analysis = analyzeSteady(
      summary,
      new Map([read('drift', block(0.7, 0.75)), read('flat', block(0.7, 0.71)), read('intervals', null)]),
    )
    expect(analysis.findings.map((f) => [f.activityId, f.rule, f.severity])).toEqual([['drift', 'hrDrift', 'moderate']])
    expect(analysis.status).toEqual({ drift: 'noBaseline', flat: 'noBaseline', intervals: 'noBlock' })
  })

  it('judges elevated heart rate against baseline rides that are not shown', () => {
    const rides = [ride(1, { id: 'high' }), ride(20, { id: 'b1' }), ride(22, { id: 'b2' }), ride(25, { id: 'b3' })]
    const summary = summaryOf(rides)
    const readings = new Map([
      read('high', block(0.76, 0.76)),
      read('b1', block(0.7, 0.7)),
      read('b2', block(0.7, 0.7)),
      read('b3', block(0.7, 0.7)),
    ])
    const analysis = analyzeSteady(summary, readings)
    expect(analysis.findings.map((f) => [f.activityId, f.rule, f.referenceRides])).toEqual([['high', 'elevatedHr', 3]])
    expect(analysis.status['high']).toBe('checked')
    expect(analysis.status['b1']).toBeUndefined()
  })

  it('shows unread rides as pending, not as calm', () => {
    const summary = summaryOf([ride(1, { id: 'a' }), ride(2, { id: 'b' })])
    const analysis = analyzeSteady(summary, new Map([read('a', block(0.7, 0.7))]))
    expect(analysis.status).toEqual({ a: 'pending', b: 'pending' })
    expect(analysis.coverage.pending).toBe(2)
  })
})

describe('the dashboard endpoints', () => {
  const store: ConfigStore = { load: async () => config, save: async (next) => next }
  const app = createApiRoutes(async () => ({
    source: httpSource({ kind: 'apiKey' as const, apiKey: 'unused', athleteId: 'i0' }),
    store,
  }))

  afterEach(() => vi.unstubAllGlobals())

  const stub = (routes: Record<string, () => Response>): string[] => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      const path = new URL(url).pathname.replace('/api/v1', '')
      calls.push(path)
      const hit = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))
      return hit ? hit[1]() : new Response('{}', { status: 500 })
    })
    return calls
  }

  it('builds the summary from the activity list alone', async () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
    const calls = stub({
      '/athlete/i0/activities': () =>
        new Response(
          JSON.stringify([
            { id: 'i1', type: 'VirtualRide', start_date_local: `${today}T07:00:00`, start_date: `${today}T05:00:00Z`, moving_time: 3600, icu_average_watts: 200 },
          ]),
        ),
    })
    const response = await app.request('/api/dashboard?wochen=8')
    const body = (await response.json()) as DashboardSummary
    expect(response.status).toBe(200)
    expect(calls.every((c) => c.startsWith('/athlete/i0/activities'))).toBe(true)
    expect(body.weeks).toHaveLength(8)
    expect(body.candidates.map((c) => c.id)).toEqual(['i1'])
  })

  it('reads blocks per ride and reports an unreadable one instead of failing', async () => {
    const calls = stub({
      '/activity/i1/streams.json': () =>
        new Response(
          JSON.stringify([
            { type: 'time', data: Array.from({ length: 3600 }, (_, s) => s) },
            { type: 'watts', data: Array(3600).fill(200) },
            { type: 'heartrate', data: Array(3600).fill(140) },
          ]),
        ),
      '/activity/i2/streams.json': () => new Response('{}', { status: 404 }),
    })
    const response = await app.request('/api/dashboard/blocks?ids=i1,i2')
    const body = (await response.json()) as BlockReading[]
    expect(response.status).toBe(200)
    expect(body.map((b) => [b.id, b.status])).toEqual([
      ['i1', 'block'],
      ['i2', 'unreadable'],
    ])
    expect(calls).toEqual(['/activity/i1/streams.json', '/activity/i2/streams.json'])
  })

  it('refuses more rides than one batch and ids that are not ids', async () => {
    const tooMany = Array.from({ length: BLOCK_BATCH + 1 }, (_, i) => `i${i}`).join(',')
    expect((await app.request(`/api/dashboard/blocks?ids=${tooMany}`)).status).toBe(400)
    expect((await app.request('/api/dashboard/blocks?ids=..%2Fathlete')).status).toBe(400)
    expect((await app.request('/api/dashboard/ride/..%2Fathlete')).status).toBe(400)
  })
})
