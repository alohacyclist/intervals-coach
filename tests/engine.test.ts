import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { intensityClass } from '../src/coach/library.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const stateFrom = (
  activities: Parameters<typeof buildState>[0],
  wellnessEntries: Parameters<typeof buildState>[1] = [wellness(0), ...baselineWellness()],
) => buildState(activities, wellnessEntries, TODAY)

const rested = [activity(9, 'Ride', { load: 60, intensity: 70 }), activity(11, 'Run', { load: 50, intensity: 70 })]

describe('plan engine', () => {
  it('always offers exactly one bike and one run option per day', () => {
    const days = planDays(stateFrom(rested), config, 3)
    expect(days).toHaveLength(3)
    for (const day of days) {
      expect(day.options.map((option) => option.sport).sort()).toEqual(['Ride', 'Run'])
    }
  })

  it('schedules quality when rested and the week is still empty', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.dayType).toBe('KEY')
    expect(today?.options.every((option) => intensityClass(option.template.stimulus) === 'hard')).toBe(true)
  })

  it('keeps 48 hours between hard sessions', () => {
    const yesterdayHard = [activity(1, 'Ride', { load: 90, intensity: 98 })]
    const [today] = planDays(stateFrom(yesterdayHard), config)
    expect(today?.dayType).toBe('EASY')
  })

  it('never plans two hard days back to back inside the three day view', () => {
    const days = planDays(stateFrom(rested), config, 3)
    const hardDays = days.map((day) => day.dayType === 'KEY')
    expect(hardDays.filter(Boolean).length).toBeGreaterThan(0)
    for (let index = 1; index < hardDays.length; index += 1) {
      expect(hardDays[index] && hardDays[index - 1]).toBeFalsy()
    }
  })

  it('drops to recovery when readiness is red', () => {
    const sick = [wellness(0, { hrv: 30, restingHr: 62, fatigue: 4 }), ...baselineWellness()]
    const [today] = planDays(stateFrom(rested, sick), config)
    expect(['RECOVERY', 'REST']).toContain(today?.dayType)
    expect(today?.options.every((option) => intensityClass(option.template.stimulus) === 'easy')).toBe(true)
  })

  it('respects the weekly hard budget', () => {
    const busyWeek = [
      activity(0, 'Ride', { load: 90, intensity: 98 }),
      activity(1, 'Run', { load: 80, intensity: 96 }),
    ]
    const [today] = planDays(stateFrom(busyWeek), config)
    expect(today?.notes.join(' ')).toContain('Wochenbudget')
  })

  it('recommends the sport that has had no quality session this week', () => {
    const bikeOnly = [activity(2, 'Ride', { load: 90, intensity: 98 })]
    const [today] = planDays(stateFrom(bikeOnly), config)
    expect(today?.recommended).toBe('Run')
  })

  it('never proposes a session longer than the time budget', () => {
    const short = { ...config, profile: { ...config.profile, maxSessionMinutes: 50 } }
    const days = planDays(stateFrom(rested), short, 3)
    for (const day of days) {
      for (const option of day.options) {
        expect(option.template.minutes).toBeLessThanOrEqual(50)
      }
    }
  })

  it('does not repeat the same workout inside the three day view', () => {
    const days = planDays(stateFrom(rested), config, 3)
    const ids = days.flatMap((day) => day.options.map((option) => option.template.id))
    const recommendedIds = days
      .map((day) => day.options.find((option) => option.sport === day.recommended)?.template.id)
      .filter(Boolean)
    expect(new Set(recommendedIds).size).toBe(recommendedIds.length)
    expect(ids.length).toBeGreaterThan(0)
  })

  it('warns while the week is below the athletes minimum session count', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.notes.join(' ')).toContain('von mindestens 2 Einheiten')
  })

  it('drops the warning once the minimum is met', () => {
    const met = [activity(0, 'Ride', { load: 55, intensity: 70 }), activity(1, 'Run', { load: 50, intensity: 70 })]
    const [today] = planDays(stateFrom(met), config)
    expect(today?.notes.join(' ')).not.toContain('von mindestens')
  })

  it('carries a workout description in intervals.icu syntax', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.options[0]?.description).toMatch(/^- /m)
    expect(today?.options[0]?.description).toContain('Warum heute')
  })
})
