import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { findTemplate } from '../src/coach/library.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import type { Completion } from '../src/coach/progression.ts'
import type { CoachConfig } from '../src/coach/types.ts'
import { validateConfig } from '../src/coach/config-schema.ts'
import { activity, baselineWellness, config, plannedEvent, TODAY, wellness } from './fixtures.ts'

const runner: CoachConfig = {
  ...config,
  goals: config.goals.filter((goal) => goal.sport === 'Run'),
  profile: { ...config.profile, sports: config.profile.sports.filter((entry) => entry.sport === 'Run') },
}

const stateFrom = (activities: Parameters<typeof buildState>[0]) =>
  buildState(activities, [wellness(0), ...baselineWellness()], TODAY)

/** A recent threshold test, so the quality day trains instead of measuring. */
const tested = (() => {
  const event = plannedEvent(20, 'test-run-thr20', { externalId: 'coach:2026-08-13:test-run-thr20' })
  return completionsFrom([event], [activity(20, 'Run', { load: 80, pairedEventId: event.id, compliance: 95 })])
})()

const threeByOne: Completion = {
  templateId: 'run-thr-short-3x1k',
  date: '2026-08-25',
  compliance: null,
  activityId: 'thr-a',
  variant: 'full',
  evidence: 'exact',
  held: true,
}

const quiet = [activity(9, 'Run', { load: 40, intensity: 70 }), activity(12, 'Run', { load: 40, intensity: 70 })]

const thresholdRuns = (days: ReturnType<typeof planDays>) =>
  days
    .flatMap((day) => day.options)
    .filter((option) => findTemplate(option.template.id)?.family === 'run-threshold')
    .map((option) => option.template.id)

describe('offering the earned rung, not the one below', () => {
  it('keeps to the 5x1km once it is earned, even after running it a few days ago', () => {
    const fiveByOne = activity(4, 'Run', { load: 65, intensity: 88, name: 'Schwelle 5x1km' })
    const days = planDays(stateFrom([fiveByOne, ...quiet]), runner, 7, [...tested, threeByOne])
    expect(thresholdRuns(days)).not.toContain('run-thr-short-3x1k')
  })

  it('still offers the short version when the day has no room for the longer one', () => {
    const tight = { ...runner, profile: { ...runner.profile, sessionMinutes: { min: 30, normal: 40, max: 45 } } }
    const days = planDays(stateFrom(quiet), tight, 7, [...tested, threeByOne])
    const offered = thresholdRuns(days)
    expect(offered).not.toContain('run-thr-5x1k')
  })
})

describe('choosing a level', () => {
  it('offers the chosen rung without the intervals having earned it', () => {
    const chosen = { ...runner, levelChoices: { 'run-threshold': 2 } }
    const days = planDays(stateFrom(quiet), chosen, 7, tested)
    const offered = thresholdRuns(days)
    expect(offered.length).toBeGreaterThan(0)
    expect(offered).not.toContain('run-thr-short-3x1k')
    const day = days.find((entry) => entry.options.some((option) => option.template.id === 'run-thr-5x1k'))
    const session = day?.options.find((option) => option.template.id === 'run-thr-5x1k')
    expect(session?.reason).toContain('selbst gewählt')
  })

  it('offers a lower rung when that is what was chosen', () => {
    const chosen = { ...runner, levelChoices: { 'run-threshold': 1 } }
    const fiveByOne: Completion = { ...threeByOne, templateId: 'run-thr-5x1k' }
    const days = planDays(stateFrom(quiet), chosen, 7, [...tested, fiveByOne])
    expect(thresholdRuns(days).every((id) => id === 'run-thr-short-3x1k')).toBe(true)
  })

  it('keeps only levels a family has', () => {
    const stored = validateConfig({ ...runner, levelChoices: { 'run-threshold': 2, 'bike-vo2': 9, nope: 1 } })
    expect(stored.levelChoices).toEqual({ 'run-threshold': 2 })
    expect(validateConfig({ ...runner, levelChoices: {} }).levelChoices).toBeUndefined()
  })
})
