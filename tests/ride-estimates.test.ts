import { describe, expect, it, vi } from 'vitest'
import {
  needsEstimate,
  readRideEstimates,
  rememberRideEstimates,
  withRideEstimates,
} from '../server/ride-estimates.ts'
import type { IntervalsSource } from '../server/source.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { MAX_RIDE_ESTIMATES, validateConfig } from '../src/coach/config-schema.ts'
import { completedFrom } from '../src/coach/done.ts'
import { buildHistory } from '../src/coach/adherence.ts'
import { matchedCompletions } from '../src/coach/matching.ts'
import { ESTIMATE_VERSION } from '../src/coach/speed-power.ts'
import type { ActivityStreams } from '../src/coach/trace.ts'
import type { CoachConfig, RideEstimate, StoredRideEstimate } from '../src/coach/types.ts'
import { TODAY, activity, config, plannedEvent } from './fixtures.ts'
import { fortyTwenty, simulate } from './ride-sim.ts'

/** The ride of the morning: outdoors, an hour and a half, no meter and no strap. */
const unmetered = (daysAgo: number, overrides = {}) =>
  activity(daysAgo, 'Ride', {
    id: `r${daysAgo}`,
    load: 0,
    intensity: 0,
    movingTimeSec: 4800,
    distanceM: 41000,
    compliance: 123,
    zoneSeconds: {},
    ...overrides,
  })

const estimate = (overrides: Partial<RideEstimate> = {}): RideEstimate => ({
  version: ESTIMATE_VERSION,
  load: 70,
  intensity: 66,
  weightedWatts: 191,
  averageWatts: 175,
  zoneSeconds: { Z2: 3000, Z5: 500, Z6: 220 },
  blocks: [
    { startSecond: 1229, seconds: 360, verdict: 'found', workWatts: 373, restWatts: 217, targetWatts: 361 },
    { startSecond: 1876, seconds: 360, verdict: 'found', workWatts: 320, restWatts: 159, targetWatts: 361 },
    { startSecond: 2475, seconds: 360, verdict: 'unclear', workWatts: 250, restWatts: 180, targetWatts: 361 },
  ],
  ...overrides,
})

const stored = (activityId: string, overrides: Partial<StoredRideEstimate> = {}): StoredRideEstimate => ({
  activityId,
  date: TODAY,
  templateId: 'bike-vo2-3040',
  version: ESTIMATE_VERSION,
  estimate: estimate(),
  ...overrides,
})

const rideStreams = (): ActivityStreams => {
  const { streams } = simulate(fortyTwenty(1230), 4800, 11)
  return { time: streams.time, speed: streams.speed, altitude: streams.altitude, distance: streams.distance, watts: null, heartRate: null }
}

const fakeSource = (streams: (activityId: string) => Promise<ActivityStreams>) => {
  const asked: { activityId: string; hills: boolean | undefined }[] = []
  const source = {
    streams: vi.fn(async (activityId: string, _sport: unknown, hills?: boolean) => {
      asked.push({ activityId, hills })
      return streams(activityId)
    }),
  } as unknown as IntervalsSource
  return { source, asked }
}

describe('which rides are read from speed', () => {
  it('only outdoor rides without load, long enough and recent', () => {
    expect(needsEstimate(unmetered(1), TODAY)).toBe(true)
    expect(needsEstimate(unmetered(1, { load: 80 }), TODAY)).toBe(false)
    expect(needsEstimate(unmetered(1, { indoor: true }), TODAY)).toBe(false)
    expect(needsEstimate(unmetered(1, { movingTimeSec: 300 }), TODAY)).toBe(false)
    expect(needsEstimate(unmetered(1, { distanceM: 0 }), TODAY)).toBe(false)
    expect(needsEstimate(unmetered(30), TODAY)).toBe(false)
    expect(needsEstimate(activity(1, 'Run', { load: 0, distanceM: 10000 }), TODAY)).toBe(false)
  })
})

describe('reading a ride without power', () => {
  it('asks for the climb too, and looks for the sets of the session it was paired with', async () => {
    const { source, asked } = fakeSource(async () => rideStreams())
    const event = plannedEvent(0, 'VO2max 3x6x40/20', {
      externalId: `coach:${TODAY}:bike-vo2-3040:55`,
      pairedActivityId: 'r0',
    })
    const read = await readRideEstimates(source, config, [unmetered(0)], [event], TODAY)

    expect(asked).toEqual([{ activityId: 'r0', hills: true }])
    expect(read).toHaveLength(1)
    expect(read[0]?.templateId).toBe('bike-vo2-3040')
    expect(read[0]?.estimate?.blocks.map((block) => block.verdict)).toEqual(['found', 'found', 'found'])
    expect(read[0]?.estimate?.load).toBeGreaterThan(0)
  })

  it('reads a ride without a session for its load alone', async () => {
    const { source } = fakeSource(async () => rideStreams())
    const [read] = await readRideEstimates(source, config, [unmetered(0)], [], TODAY)
    expect(read?.templateId).toBeNull()
    expect(read?.estimate?.blocks).toEqual([])
  })

  it('reads each ride once, two at a time, newest first', async () => {
    const { source, asked } = fakeSource(async () => rideStreams())
    const known: CoachConfig = { ...config, rideEstimates: [stored('r1')] }
    await readRideEstimates(source, known, [unmetered(4), unmetered(1), unmetered(2), unmetered(3)], [], TODAY)
    expect(asked.map((entry) => entry.activityId)).toEqual(['r2', 'r3'])
  })

  it('reads a ride again once the reading has changed', async () => {
    const { source, asked } = fakeSource(async () => rideStreams())
    const outdated: CoachConfig = { ...config, rideEstimates: [stored('r1', { version: ESTIMATE_VERSION - 1 })] }
    await readRideEstimates(source, outdated, [unmetered(1)], [], TODAY)
    expect(asked.map((entry) => entry.activityId)).toEqual(['r1'])
  })

  it('keeps a ride that cannot be read as unreadable, and one that failed to load for later', async () => {
    const flat = fakeSource(async () => ({ ...rideStreams(), altitude: null }))
    const [unreadable] = await readRideEstimates(flat.source, config, [unmetered(1)], [], TODAY)
    expect(unreadable?.estimate).toBeNull()

    const down = fakeSource(async () => {
      throw new Error('intervals.icu 503')
    })
    expect(await readRideEstimates(down.source, config, [unmetered(1)], [], TODAY)).toEqual([])
  })

  it('leaves a ride alone whose power arrived after all', async () => {
    const { source } = fakeSource(async () => ({ ...rideStreams(), watts: [0, 180, 185] }))
    expect(await readRideEstimates(source, config, [unmetered(1)], [], TODAY)).toEqual([])
  })
})

describe('a ride with its estimate', () => {
  it('counts with the estimated load and time in zone, without the compliance that measured only time', () => {
    const [ride] = withRideEstimates([unmetered(0)], [stored('r0')])
    expect(ride?.load).toBe(70)
    expect(ride?.intensity).toBe(66)
    expect(ride?.zoneSeconds).toEqual({ Z2: 3000, Z5: 500, Z6: 220 })
    expect(ride?.compliance).toBeNull()
    expect(ride?.estimate).toEqual({ blocksFound: 2, blocksUnclear: 1, blocksTotal: 3 })
  })

  it('never stands in for a load intervals.icu has, nor when the ride could not be read', () => {
    const measured = unmetered(0, { load: 88 })
    expect(withRideEstimates([measured], [stored('r0')])).toEqual([measured])
    const ride = unmetered(0)
    expect(withRideEstimates([ride], [stored('r0', { estimate: null })])).toEqual([ride])
    expect(withRideEstimates([ride], [stored('r0', { version: ESTIMATE_VERSION + 1 })])).toEqual([ride])
  })

  it('shows as done, its load marked as estimated, on the day and in the last seven days', () => {
    const activities = withRideEstimates([unmetered(0)], [stored('r0')])
    const [done] = completedFrom(activities, [])
    expect(done?.load).toBe(70)
    expect(done?.estimate?.blocksFound).toBe(2)

    const today = buildHistory([], activities, TODAY, 1).at(-1)
    expect(today?.load).toBe(70)
    expect(today?.estimated).toBe(true)
  })

  it('is recognised as the session at most as close, never as exact', () => {
    const activities = withRideEstimates([unmetered(0)], [stored('r0')])
    const proposals = [{ date: TODAY, recommended: 'bike-vo2-3040', templateIds: ['bike-vo2-3040'] }]
    const [match] = matchedCompletions(proposals, activities, config.profile)
    expect(match?.templateId).toBe('bike-vo2-3040')
    expect(match?.evidence).toBe('similar')
  })
})

describe('keeping the estimates', () => {
  it('adds new readings to what is stored, the newer reading of a ride replacing the older', async () => {
    let saved: CoachConfig = { ...config, rideEstimates: [stored('r1'), stored('r2', { estimate: null })] }
    const store: ConfigStore = {
      load: async () => saved,
      save: async (next) => {
        saved = next
        return next
      },
    }
    await rememberRideEstimates(store, [stored('r2'), stored('r3')])
    expect(saved.rideEstimates?.map((entry) => [entry.activityId, entry.estimate !== null])).toEqual([
      ['r1', true],
      ['r2', true],
      ['r3', true],
    ])
  })

  it('validates what comes back from storage and keeps only the newest', () => {
    const many = Array.from({ length: MAX_RIDE_ESTIMATES + 5 }, (_, index) =>
      stored(`r${index}`, { date: `2026-0${1 + Math.floor(index / 28)}-${String(1 + (index % 28)).padStart(2, '0')}` }),
    )
    const broken = [{ activityId: 'x', date: 'gestern', version: 1, templateId: null, estimate: null }]
    const tampered = stored('t', { estimate: { ...estimate(), blocks: [{ verdict: 'sicher' }] } as unknown as RideEstimate })
    const valid = validateConfig({ ...config, rideEstimates: [...many, ...broken, tampered] })
    expect(valid.rideEstimates).toHaveLength(MAX_RIDE_ESTIMATES)
    expect(valid.rideEstimates?.some((entry) => entry.activityId === 'x')).toBe(false)
    expect(valid.rideEstimates?.find((entry) => entry.activityId === 't')?.estimate ?? null).toBeNull()
    // A config without any reads back as it was written.
    expect(validateConfig(config)).toEqual(config)
  })
})
