import { describe, expect, it } from 'vitest'
import type { Activity } from '../src/coach/types.ts'
import type { Completion } from '../src/coach/progression.ts'
import { buildProgress } from '../src/coach/progress.ts'
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
    // Nothing from day -20 to day -3, then two days trained, then today off.
    expect(progress.totals.longestBreak).toBe(18)
  })
})
