import { describe, expect, it } from 'vitest'
import type { Activity } from '../src/coach/types.ts'
import type { Completion } from '../src/coach/progression.ts'
import { buildProgress, isProgressSpan, weeksFor } from '../src/coach/progress.ts'
import { addDays, startOfWeek } from '../src/coach/dates.ts'
import { activity, TODAY } from './fixtures.ts'

const done = (templateId: string, daysAgo: number): Completion => ({
  templateId,
  date: addDays(TODAY, -daysAgo),
  compliance: 95,
  activityId: `done-${templateId}`,
  variant: 'full',
  evidence: 'calendar',
})

describe('buildProgress', () => {
  it('returns one fitness point per day of history, ending today', () => {
    const progress = buildProgress([activity(3, 'Ride')], [], TODAY, 60)
    expect(progress.fitness).toHaveLength(61)
    expect(progress.fitness[0]?.date).toBe(addDays(TODAY, -60))
    expect(progress.fitness[progress.fitness.length - 1]?.date).toBe(TODAY)
  })

  it('lets fatigue outrun fitness right after a hard day', () => {
    const progress = buildProgress([activity(0, 'Ride', { load: 200 })], [], TODAY, 60)
    const last = progress.fitness[progress.fitness.length - 1]
    expect(last!.atl).toBeGreaterThan(last!.ctl)
  })

  it('buckets load into calendar weeks and marks the running one as partial', () => {
    const progress = buildProgress([activity(0, 'Ride', { load: 80 })], [], TODAY, 60, 4)
    expect(progress.weeks).toHaveLength(4)
    const current = progress.weeks[progress.weeks.length - 1]
    expect(current?.start).toBe(startOfWeek(TODAY))
    expect(current?.partial).toBe(true)
    expect(current?.load).toBe(80)
    // Earlier weeks are over, so they are drawn as whole weeks.
    expect(progress.weeks.slice(0, -1).every((week) => week.partial)).toBe(false)
  })

  it('starts every family at its lowest level and lifts the one that was cleared', () => {
    const fresh = buildProgress([], [], TODAY)
    expect(fresh.levels.length).toBeGreaterThan(0)
    expect(fresh.levels.every((entry) => entry.level === 1)).toBe(true)
    expect(fresh.levels.every((entry) => entry.top >= entry.level)).toBe(true)

    const climbed = buildProgress([], [done('bike-thr-3x12', 10)], TODAY)
    const bike = climbed.levels.find((entry) => entry.family === 'bike-threshold')
    expect(bike?.level).toBeGreaterThan(1)
    expect(bike?.sport).toBe('Ride')
    expect(bike?.label).toBe('Schwelle')
  })

  it('counts only sessions carrying load and names the longest gap', () => {
    const activities: readonly Activity[] = [
      activity(1, 'Ride', { load: 50, movingTimeSec: 3600 }),
      activity(2, 'Run', { load: 40, movingTimeSec: 1800 }),
      // A walk intervals.icu detected: no load, so it is not a session.
      activity(3, 'Ride', { load: 0, movingTimeSec: 1800 }),
    ]
    const progress = buildProgress(activities, [], TODAY, 20)
    expect(progress.totals.sessions).toBe(2)
    expect(progress.totals.load).toBe(90)
    expect(progress.totals.hours).toBe(2)
    expect(progress.totals.days).toBe(2)
    expect(progress.totals.sessionsBySport).toEqual({ Ride: 1, Run: 1 })
    // Counted from the first session on: trained on -2 and -1, nothing today.
    expect(progress.totals.longestBreak).toBe(1)
  })

  it('does not count the time before the first session as a break', () => {
    // An account three days old must not report a 100 day pause.
    const progress = buildProgress([activity(1, 'Ride', { load: 50 })], [], TODAY, 100)
    expect(progress.totals.longestBreak).toBe(1)
    expect(buildProgress([], [], TODAY, 100).totals.longestBreak).toBe(0)
  })

  it('finds the real gap between two blocks of training', () => {
    const activities: readonly Activity[] = [
      activity(30, 'Ride', { load: 50 }),
      activity(9, 'Ride', { load: 50 }),
      activity(8, 'Ride', { load: 50 }),
    ]
    // Day -30 trained, then nothing until day -9: twenty empty days between.
    expect(buildProgress(activities, [], TODAY, 60).totals.longestBreak).toBe(20)
  })

  it('leaves out the families of sports the athlete does not train', () => {
    const rider = buildProgress([], [], TODAY, 180, 12, {
      benchmark: { due: false, weeksSinceLast: null, intervalWeeks: 0, sessions: [], results: [] },
      feasibility: [],
      sports: ['Ride'],
    })
    expect(rider.levels.length).toBeGreaterThan(0)
    expect(rider.levels.every((entry) => entry.sport === 'Ride')).toBe(true)
    // No sports named at all still means the whole library, as the tests use it.
    expect(buildProgress([], [], TODAY).levels.some((entry) => entry.sport === 'Swim')).toBe(true)
  })
})

describe('progress span', () => {
  it('starts a short span from the fitness already built, not from zero', () => {
    const before = Array.from({ length: 60 }, (_, index) => activity(31 + index, 'Ride', { load: 80 }))
    const progress = buildProgress(before, [], TODAY, 30)
    expect(progress.fitness).toHaveLength(31)
    expect(progress.fitness[0]!.ctl).toBeGreaterThan(40)
  })

  it('gives a bar per week of the span, at least four', () => {
    expect(weeksFor(30)).toBe(5)
    expect(weeksFor(365)).toBe(53)
    expect(weeksFor(7)).toBe(4)
  })

  it('accepts only the offered spans', () => {
    expect(isProgressSpan(90)).toBe(true)
    expect(isProgressSpan(360)).toBe(false)
  })
})
