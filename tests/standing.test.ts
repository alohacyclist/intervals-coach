import { describe, expect, it } from 'vitest'
import { buildStanding, raceSeconds } from '../src/coach/standing.ts'
import type { Activity, AthleteProfile, Goal, Wellness } from '../src/coach/types.ts'
import { activity, config, TODAY, wellness } from './fixtures.ts'

const profile: AthleteProfile = { ...config.profile, maxHr: 186, lthr: 168 }

const rested = (days = 30): readonly Wellness[] =>
  Array.from({ length: days }, (_unused, index) => wellness(index, { restingHr: 48 }))

/**
 * A run at 5:30/km that used 61 % of the heart rate reserve: what a runner of
 * VDOT 50 does on an easy hour (Daniels' oxygen cost, Swain's reserve).
 */
const easyRun = (daysAgo: number, overrides: Partial<Activity> = {}): Activity =>
  activity(daysAgo, 'Run', {
    id: `run-${daysAgo}`,
    load: 55,
    movingTimeSec: 3600,
    distanceM: 10909,
    elevationM: 40,
    averageHr: 133,
    ...overrides,
  })

const runsEveryOtherDay = (count: number, overrides: Partial<Activity> = {}) =>
  Array.from({ length: count }, (_unused, index) => easyRun(index * 2 + 1, overrides))

const ftpGoal = (targetValue: number, targetDate?: string): Goal => ({
  id: 'ftp',
  sport: 'Ride',
  kind: 'ftp',
  label: `FTP ${targetValue}`,
  targetValue,
  currentValue: 250,
  priority: 'A',
  ...(targetDate ? { targetDate } : {}),
})

const tenK: Goal = {
  id: '10k',
  sport: 'Run',
  kind: 'raceTime',
  label: '10 km unter 40',
  targetValue: 2400,
  currentValue: 2500,
  distanceKm: 10,
  targetDate: '2027-04-01',
  priority: 'A',
}

/** eFTP rising by a watt a week over twelve weeks, to 262 W today. */
const risingEftp = (): readonly Wellness[] =>
  Array.from({ length: 85 }, (_unused, index) =>
    wellness(index, { restingHr: 48, eftpBySport: { Ride: 262 - Math.floor(index / 7) } }),
  )

const standingOf = (
  activities: readonly Activity[],
  wellnessEntries: readonly Wellness[],
  goals: readonly Goal[] = [],
  athlete: AthleteProfile = profile,
) => buildStanding(activities, wellnessEntries, athlete, goals, ['Ride', 'Run'], TODAY, 84)

describe('race time from running fitness', () => {
  it('matches Daniels’ tables', () => {
    expect(raceSeconds(50, 10000)).toBeCloseTo(2481, -1)
    expect(raceSeconds(50, 21097.5)).toBeCloseTo(5495, -1)
    expect(raceSeconds(60, 5000)).toBeCloseTo(1023, -1)
  })
})

describe('standing on the bike', () => {
  it('follows intervals.icu’s estimated FTP week by week', () => {
    const ride = standingOf([], risingEftp()).find((entry) => entry.sport === 'Ride')
    expect(ride).toMatchObject({ measure: 'ftp', current: 262, change: 4, source: 'eftp' })
    expect(ride?.series.at(-1)).toEqual({ date: TODAY, value: 262 })
    expect(ride?.series).toHaveLength(13)
  })

  it('puts the goal where the trend reaches it', () => {
    const [ride] = standingOf([], risingEftp(), [ftpGoal(270, '2027-06-01')])
    expect(ride?.verdict).toBe('on-track')
    // A watt a week, eight watts missing: about eight weeks.
    expect(ride?.reachBy).toBe('2026-10-28')
  })

  it('says when the trend arrives after the date', () => {
    const [ride] = standingOf([], risingEftp(), [ftpGoal(270, '2026-09-30')])
    expect(ride?.verdict).toBe('late')
  })

  it('knows a goal already reached', () => {
    const [ride] = standingOf([], risingEftp(), [ftpGoal(255)])
    expect(ride).toMatchObject({ verdict: 'reached', reachBy: null })
  })

  it('names no date when nothing moves', () => {
    const flat = Array.from({ length: 60 }, (_unused, index) => wellness(index, { eftpBySport: { Ride: 250 } }))
    const [ride] = standingOf([], flat, [ftpGoal(270)])
    expect(ride).toMatchObject({ verdict: 'stalled', reachBy: null })
  })

  it('falls back to the FTP in the profile without an estimate', () => {
    const [ride] = standingOf([], rested())
    expect(ride).toMatchObject({ current: 280, source: 'setting', series: [], change: null })
  })
})

describe('standing on foot', () => {
  it('reads the 10 km a runner could do from pace and heart rate', () => {
    const run = standingOf(runsEveryOtherDay(12), rested()).find((entry) => entry.sport === 'Run')
    expect(run).toMatchObject({ measure: 'race', distanceKm: 10, source: 'runs' })
    // VDOT 50 runs 10 km in 41:21.
    expect(Math.abs((run?.current ?? 0) - 2481)).toBeLessThan(45)
  })

  it('reads the distance of the race goal', () => {
    const half: Goal = { ...tenK, id: 'half', distanceKm: 21.1, targetValue: 5400 }
    const run = standingOf(runsEveryOtherDay(12), rested(), [half]).find((entry) => entry.sport === 'Run')
    expect(run?.distanceKm).toBe(21.1)
    expect(run?.goal).toEqual({ id: 'half', value: 5400, date: '2027-04-01' })
  })

  it('never reads slower than a race actually run', () => {
    // 10 km in 39:00, whatever the heart said on the easy days.
    const race = easyRun(3, { id: 'race', movingTimeSec: 2340, distanceM: 10000, averageHr: 178 })
    const run = standingOf([...runsEveryOtherDay(12), race], rested()).find((entry) => entry.sport === 'Run')
    expect(run?.current).toBeLessThanOrEqual(2340)
  })

  it('leaves out hilly runs, whose climbing the flat formula cannot see', () => {
    const hilly = runsEveryOtherDay(12, { elevationM: 400 })
    const run = standingOf(hilly, rested()).find((entry) => entry.sport === 'Run')
    expect(run?.source).toBe('setting')
  })

  it('falls back to the threshold pace without heart rate', () => {
    const run = standingOf(runsEveryOtherDay(12, { averageHr: null }), rested()).find((entry) => entry.sport === 'Run')
    expect(run).toMatchObject({ source: 'setting', series: [] })
    // Threshold 3:56/km is an hour at that pace: about 37:50 over 10 km.
    expect(run?.current).toBeGreaterThan(2200)
    expect(run?.current).toBeLessThan(2350)
  })

  it('counts a faster time as progress towards a race goal', () => {
    const fitter = [
      ...Array.from({ length: 8 }, (_unused, index) => easyRun(index * 2 + 1, { averageHr: 128 })),
      ...Array.from({ length: 30 }, (_unused, index) => easyRun(index * 2 + 21, { averageHr: 140 })),
    ]
    const run = standingOf(fitter, rested(), [tenK]).find((entry) => entry.sport === 'Run')
    expect(run?.change).toBeLessThan(0)
    expect(['on-track', 'late', 'reached']).toContain(run?.verdict)
  })
})
