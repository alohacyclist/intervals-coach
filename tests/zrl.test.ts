import { describe, expect, it } from 'vitest'
import { estimateRace, isZrlRace, raceSamples, zrlRaceOn } from '../src/coach/zrl.ts'
import type { Activity, RaceSample, ZrlRace, ZwiftRoute } from '../src/coach/types.ts'
import { activity, TODAY } from './fixtures.ts'

const name = (kind: 'Race' | 'TTT', route: string) =>
  `Zwift - ${kind}: Zwift Racing League: City Showdown - Open Emerald League Division 2 (B) on ${route} in New York`

/** The athlete's own league races of 2025, as intervals.icu reported them. */
const HISTORY: readonly [string, 'Race' | 'TTT', number, number, number, number, number][] = [
  ['2025-12-09', 'Race', 31158, 305, 2877, 91, 66],
  ['2025-12-02', 'Race', 33024, 364, 2841, 100, 79],
  ['2025-11-25', 'TTT', 37136, 241, 3151, 91, 73],
  ['2025-11-18', 'Race', 47053, 712, 4659, 92, 110],
  ['2025-11-11', 'Race', 44192, 764, 4370, 91.3, 101],
  ['2025-11-04', 'TTT', 37114, 255, 3347, 88.7, 73],
  ['2025-10-07', 'Race', 43138, 326, 4028, 92, 95],
  ['2025-09-30', 'Race', 36304, 335, 3474, 91.7, 81],
  ['2025-09-23', 'Race', 44417, 333, 4216, 94.3, 104],
  ['2025-09-16', 'TTT', 30212, 166, 2598, 91.3, 60],
]

const history: readonly RaceSample[] = HISTORY.map(
  ([date, kind, distance, elevation, seconds, intensity, load]) => ({
    date,
    teamTimeTrial: kind === 'TTT',
    minutes: seconds / 60,
    distanceKm: distance / 1000,
    elevationM: elevation,
    intensity,
    load,
  }),
)

const risingEmpire: ZwiftRoute = {
  id: 3078665969,
  name: 'Rising Empire',
  world: 'new-york',
  distanceKm: 20.816,
  elevationM: 377,
  leadInKm: 0.38,
  leadInElevationM: 2,
}

const race = (overrides: Partial<ZrlRace> = {}): ZrlRace => ({
  date: TODAY,
  format: 'scratch',
  route: risingEmpire,
  laps: 2,
  ...overrides,
})

describe('recognising league races', () => {
  it('knows a league race by the name Zwift gives it', () => {
    expect(isZrlRace({ name: name('TTT', 'Watts the Limit') })).toBe(true)
    expect(isZrlRace({ name: 'Zwift - Race: Stage 2: Rolling With ENVE' })).toBe(false)
  })

  it('reads the ridden races, and tells a team time trial from a mass start', () => {
    const activities: readonly Activity[] = [
      activity(20, 'Ride', {
        name: name('TTT', 'Watts the Limit'),
        movingTimeSec: 3151,
        distanceM: 37136,
        elevationM: 241,
        intensity: 91,
        load: 73,
      }),
      activity(13, 'Ride', {
        name: name('Race', 'Rising Empire'),
        movingTimeSec: 4370,
        distanceM: 44192,
        elevationM: 764,
        intensity: 91,
        load: 101,
      }),
      activity(12, 'Ride', { name: 'GPLAMA - ULTIMATE WARM UP', load: 22 }),
    ]
    const samples = raceSamples(activities)
    expect(samples.map((sample) => sample.teamTimeTrial)).toEqual([true, false])
    expect(samples[1]).toMatchObject({ distanceKm: 44.192, elevationM: 764, load: 101 })
  })
})

describe('what a race will cost', () => {
  it('estimates a hilly scratch race close to what the athlete actually rode there', () => {
    // Rising Empire, two laps: 73 min and 101 TSS in November.
    const estimate = estimateRace(race(), history, [])
    expect(estimate.raceMinutes).toBeGreaterThanOrEqual(62)
    expect(estimate.raceMinutes).toBeLessThanOrEqual(84)
    expect(estimate.load).toBeGreaterThanOrEqual(95)
    expect(estimate.load).toBeLessThanOrEqual(130)
    expect(estimate.stimulus).toBe('VO2')
    expect(estimate.rough).toBe(false)
    expect(estimate.basedOn).toBe(7)
  })

  it('treats a team time trial as threshold work', () => {
    expect(estimateRace(race({ format: 'ttt' }), history, []).stimulus).toBe('THRESHOLD')
  })

  it('estimates the new Race of Truth like a time trial until it has its own history', () => {
    const truth = estimateRace(race({ format: 'truth' }), history, [])
    expect(truth.stimulus).toBe('THRESHOLD')
    expect(truth.basedOn).toBe(3)
  })

  it('uses the entered format for a past race instead of guessing from the name', () => {
    // One Race of Truth of its own is not yet enough, so time trials still count alongside it.
    const entered: ZrlRace[] = [race({ date: '2025-12-09', format: 'truth' })]
    expect(estimateRace(race({ format: 'truth' }), history, entered).basedOn).toBe(4)
    expect(estimateRace(race({ format: 'scratch' }), history, entered).basedOn).toBe(6)
  })

  it('falls back to the usual race length while the route is not out yet', () => {
    const estimate = estimateRace(race({ route: null }), history, [])
    expect(estimate.raceMinutes).toBeGreaterThanOrEqual(58)
    expect(estimate.raceMinutes).toBeLessThanOrEqual(70)
    expect(estimate.rough).toBe(true)
    expect(estimate.distanceKm).toBeNull()
  })

  it('says plainly when there is no history to lean on', () => {
    const estimate = estimateRace(race(), [], [])
    expect(estimate.rough).toBe(true)
    expect(estimate.basedOn).toBe(0)
    expect(estimate.raceMinutes).toBeGreaterThan(40)
    expect(estimate.load).toBeGreaterThan(50)
  })

  it('adds the warm-up on top of the race', () => {
    const estimate = estimateRace(race(), history, [])
    expect(estimate.minutes).toBe(estimate.raceMinutes + estimate.warmupMinutes)
  })
})

describe('race dates', () => {
  it('finds the race entered for a date', () => {
    expect(zrlRaceOn([race()], TODAY)?.format).toBe('scratch')
    expect(zrlRaceOn([race()], '2026-09-03')).toBeNull()
  })
})
