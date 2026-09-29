import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { phaseForSport, seasonBand, weeklyHardBudget } from '../src/coach/phase.ts'
import { validateConfig } from '../src/coach/config-schema.ts'
import { addDays } from '../src/coach/dates.ts'
import type { CoachConfig } from '../src/coach/types.ts'
import { activity, baselineWellness, config, RUN_THRESHOLD, SWIM_THRESHOLD, TODAY, wellness } from './fixtures.ts'

const fit: CoachConfig = { ...config, goals: [] }
const runner: CoachConfig = {
  ...fit,
  profile: { ...fit.profile, sports: [{ sport: 'Run', threshold: RUN_THRESHOLD }] },
}
const swimmer: CoachConfig = {
  ...fit,
  profile: { ...fit.profile, sports: [{ sport: 'Swim', threshold: SWIM_THRESHOLD }] },
}

const state = buildState(
  [activity(9, 'Ride', { load: 60, intensity: 70 }), activity(11, 'Run', { load: 50, intensity: 70 })],
  [wellness(0), ...baselineWellness()],
  TODAY,
)

describe('training without a goal', () => {
  it('is a valid configuration', () => {
    expect(validateConfig(fit).goals).toEqual([])
  })

  it('cycles through base and build blocks like an undated goal', () => {
    const phases = new Set(
      Array.from({ length: 16 }, (_, week) => phaseForSport(fit, 'Ride', addDays('2026-08-31', week * 7))),
    )
    expect([...phases].sort()).toEqual(['BASE', 'BUILD', 'RECOVERY'])
    const band = seasonBand(fit, TODAY)
    expect(band).toHaveLength(16)
    expect(band.some((week) => week.goalWeek)).toBe(false)
  })

  it('plans every sport the athlete trains', () => {
    for (const athlete of [fit, runner, swimmer]) {
      const days = planDays(state, athlete, 3)
      expect(days).toHaveLength(3)
      for (const day of days) {
        const sports = athlete.profile.sports.map((setting) => setting.sport)
        expect(day.options.map((option) => option.sport)).toEqual(sports)
        expect(day.dayType).toMatch(/^(KEY|EASY|REST|RECOVERY)$/)
      }
      expect(days.some((day) => day.dayType === 'KEY')).toBe(true)
    }
  })

  it('holds a runner without a goal to the weekly hard budget', () => {
    // The phase used to be looked up for the bike, which a runner does not have,
    // so the budget came out as NaN and every rested day turned hard.
    const busy = { ...runner, profile: { ...runner.profile, weeklySessions: { min: 5, max: 7 } } }
    const days = planDays(state, busy, 5)
    const budget = weeklyHardBudget(phaseForSport(busy, 'Run', TODAY), busy.profile)
    expect(days.filter((day) => day.dayType === 'KEY').length).toBeLessThanOrEqual(budget)
  })

  it('keeps a sensible hard session budget', () => {
    for (let week = 0; week < 8; week += 1) {
      const phase = phaseForSport(runner, 'Run', addDays(TODAY, week * 7))
      expect(weeklyHardBudget(phase, runner.profile)).toBeGreaterThan(0)
    }
  })
})
