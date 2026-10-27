import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState, layoffFrom } from '../src/coach/state.ts'
import { weeklyHardBudget } from '../src/coach/phase.ts'
import { addDays } from '../src/coach/dates.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import { activity, baselineWellness, config, plannedEvent, TODAY, wellness } from './fixtures.ts'
import type { Activity } from '../src/coach/types.ts'

const stateFrom = (activities: readonly Activity[]) =>
  buildState(activities, [wellness(0), ...baselineWellness()], TODAY)

/** Recent tests for both sports, so a quality day trains instead of measuring. */
const measured = ['test-bike-ftp20', 'test-run-thr20'].flatMap((templateId) => {
  const event = plannedEvent(20, templateId, { externalId: `coach:2026-08-01:${templateId}` })
  return completionsFrom([event], [activity(20, 'Ride', { load: 80, pairedEventId: event.id, compliance: 95 })])
})

/** Six weeks of ordinary training, ending `daysAgo` days back. */
const trainingUntil = (daysAgo: number): readonly Activity[] =>
  Array.from({ length: 21 }, (_unused, index) => daysAgo + 2 * index).map((day, index) =>
    activity(day, index % 2 === 0 ? 'Ride' : 'Run', { load: 55, intensity: 72 }),
  )

describe('the hard sessions a week can carry', () => {
  it('keeps four or five sessions a week to two hard ones', () => {
    for (const max of [4, 5]) {
      expect(weeklyHardBudget('BUILD', { ...config.profile, weeklySessions: { min: 3, max } })).toBe(2)
    }
  })

  it('allows a third only from six sessions a week', () => {
    expect(weeklyHardBudget('BUILD', { ...config.profile, weeklySessions: { min: 5, max: 6 } })).toBe(3)
  })
})

describe('the sport a quality day goes to', () => {
  const rideGoalOnly = { ...config, goals: config.goals.filter((goal) => goal.sport === 'Ride') }

  it("gives it to the goal's sport, even when that sport had its quality this week", () => {
    // Monday's hard ride, two days ago: the run has had none, but the goal is on the bike.
    const week = [activity(2, 'Ride', { load: 90, intensity: 98 }), ...trainingUntil(9)]
    const [today] = planDays(stateFrom(week), rideGoalOnly, 1, measured)
    expect(today?.dayType).toBe('KEY')
    expect(today?.recommended).toBe('Ride')
  })

  it('keeps the quality for the goal in its last weeks, waiting for the legs rather than using the bike', () => {
    const closeRun = {
      ...config,
      goals: config.goals.map((goal) => (goal.sport === 'Run' ? { ...goal, targetDate: addDays(TODAY, 20) } : goal)),
    }
    const week = [activity(2, 'Run', { load: 90, intensity: 98, movingTimeSec: 3000 }), ...trainingUntil(9)]
    const [today, thursday] = planDays(stateFrom(week), closeRun, 2, measured)
    expect(today?.dayType).toBe('EASY')
    expect(today?.notes[0]).toContain('72h')
    expect(thursday?.dayType).toBe('KEY')
    expect(thursday?.recommended).toBe('Run')
  })
})

describe('coming back after three weeks without training', () => {
  const afterGap = trainingUntil(21)

  it('reads the gap from the data, with no break declared', () => {
    expect(layoffFrom(afterGap, TODAY)).toEqual({ gapDays: 21, since: TODAY, sessionsSince: 0 })
    expect(layoffFrom(trainingUntil(1), TODAY)).toBeNull()
    expect(layoffFrom([], TODAY)).toBeNull()
  })

  it('still counts the way back once training has resumed', () => {
    const resumed = [activity(3, 'Run', { load: 40 }), activity(1, 'Ride', { load: 45 }), ...trainingUntil(24)]
    expect(layoffFrom(resumed, TODAY)).toEqual({ gapDays: 21, since: addDays(TODAY, -3), sessionsSince: 2 })
  })

  it('lets the way back end after about as long as the gap', () => {
    const longAgo = [activity(12, 'Run'), activity(9, 'Ride'), activity(5, 'Run'), activity(2, 'Ride'), ...trainingUntil(23)]
    expect(layoffFrom(longAgo, TODAY)).toBeNull()
  })

  it('starts with easy sessions, then one quality session a week, and no VO2max', () => {
    const days = planDays(stateFrom(afterGap), config, 7, measured)
    expect(days.slice(0, 2).every((day) => day.dayType !== 'KEY')).toBe(true)
    // Wednesday to Sunday, the rest of this calendar week.
    expect(days.slice(0, 5).filter((day) => day.dayType === 'KEY').length).toBeLessThanOrEqual(1)
    expect(days.flatMap((day) => day.options).some((option) => option.template.stimulus === 'VO2')).toBe(false)
    expect(days[0]?.notes.join(' ')).toContain('Wiedereinstieg nach 21 Tagen')
  })

  it('offers the last level mastered again, not the next one', () => {
    const cleared = ['bike-thr-short-3x8'].flatMap((templateId, index) => {
      const event = plannedEvent(30 + index, templateId, { externalId: `coach:2026-08-01:${templateId}` })
      return completionsFrom([event], [activity(30 + index, 'Ride', { load: 80, pairedEventId: event.id, compliance: 95 })])
    })
    const levelOf = (days: ReturnType<typeof planDays>) =>
      Math.max(
        ...days
          .flatMap((day) => day.options)
          .filter((option) => option.template.family === 'bike-threshold')
          .map((option) => option.template.level ?? 1),
      )
    expect(levelOf(planDays(stateFrom(trainingUntil(1)), config, 7, [...measured, ...cleared]))).toBe(2)
    expect(levelOf(planDays(stateFrom(afterGap), config, 7, [...measured, ...cleared]))).toBe(1)
  })

  it('trains normally again once the way back is over', () => {
    const backLongAgo = [
      ...Array.from({ length: 30 }, (_unused, index) => index + 1)
        .filter((day) => day % 2 === 1)
        .map((day) => activity(day, day % 4 === 1 ? 'Ride' : 'Run', { load: 55, intensity: 72 })),
      ...trainingUntil(45),
    ]
    const days = planDays(stateFrom(backLongAgo), config, 3, measured)
    expect(days.some((day) => day.notes.join(' ').includes('Wiedereinstieg'))).toBe(false)
  })
})

