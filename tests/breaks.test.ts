import { describe, expect, it } from 'vitest'
import { breakLimit, endedBefore, returnWindow } from '../src/coach/breaks.ts'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays } from '../src/coach/dates.ts'
import type { CoachConfig, TrainingBreak } from '../src/coach/types.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const entry = (kind: TrainingBreak['kind'], fromDaysAgo: number, days: number): TrainingBreak => ({
  id: `${kind}-test`,
  kind,
  from: addDays(TODAY, -fromDaysAgo),
  until: addDays(TODAY, -fromDaysAgo + days - 1),
})

const withBreaks = (breaks: readonly TrainingBreak[]): CoachConfig => ({ ...config, breaks })

/** Rested and well: without a break today would be a quality day. */
const rested = [
  activity(9, 'Ride', { load: 60, intensity: 70 }),
  activity(11, 'Run', { load: 50, intensity: 70 }),
]
const state = () => buildState(rested, [wellness(0), ...baselineWellness()], TODAY)

describe('what a declared break allows', () => {
  it('plans nothing for the first days after a vaccination', () => {
    const limit = breakLimit([entry('vaccination', 0, 14)], TODAY)
    expect(limit?.dayType).toBe('REST')
    expect(limit?.reason).toContain('12 bis 36 Stunden')
  })

  it('opens up to easy once the reaction is past', () => {
    const limit = breakLimit([entry('vaccination', 2, 14)], TODAY)
    expect(limit?.dayType).toBe('EASY')
    expect(limit?.daysLeft).toBe(12)
  })

  it('keeps illness closed for longer than a vaccination', () => {
    expect(breakLimit([entry('illness', 2, 7)], TODAY)?.dayType).toBe('REST')
    expect(breakLimit([entry('vaccination', 2, 7)], TODAY)?.dayType).toBe('EASY')
  })

  it('says nothing at all when no break is running', () => {
    expect(breakLimit([entry('illness', 20, 7)], TODAY)).toBeNull()
    expect(breakLimit([], TODAY)).toBeNull()
  })
})

describe('a break in the plan', () => {
  it('refuses a quality day even to a rested athlete', () => {
    const days = planDays(state(), withBreaks([entry('vaccination', 3, 14)]), 3)
    for (const day of days) {
      expect(day.dayType, day.date).not.toBe('KEY')
    }
  })

  it('offers what it offers voluntarily, never as a plan to live up to', () => {
    const [today] = planDays(state(), withBreaks([entry('vaccination', 3, 14)]), 3)
    expect(today?.dayType).toBe('EASY')
    expect(today?.optional).toBe(true)
  })

  it('stops counting the week as a shortfall', () => {
    const [today] = planDays(state(), withBreaks([entry('illness', 1, 7)]), 3)
    expect(today?.notes.join(' ')).not.toContain('von mindestens')
  })

  it('does not let the intent buttons lift it', () => {
    const [today] = planDays(state(), withBreaks([entry('illness', 1, 7)]), 3, [], 'hard')
    expect(today?.dayType).not.toBe('KEY')
    expect(today?.notes.join(' ')).toContain('beende sie')
  })
})

describe('coming back', () => {
  it('keeps intensity back for a few days after the break ends', () => {
    const after = [entry('illness', 10, 7)]
    expect(returnWindow(after, TODAY)?.note).toContain('VO₂max')
  })

  it('lets go once the window has passed', () => {
    expect(returnWindow([entry('illness', 30, 7)], TODAY)).toBeNull()
  })

  it('has no window for a break that was only absence', () => {
    expect(returnWindow([entry('pause', 10, 7)], TODAY)).toBeNull()
  })

  it('reaches for threshold before VO2max on the first day back', () => {
    const days = planDays(state(), withBreaks([entry('illness', 8, 7)]), 1)
    const stimuli = days[0]?.options.map((option) => option.template.stimulus) ?? []
    expect(stimuli.length).toBeGreaterThan(0)
    expect(stimuli).not.toContain('VO2')
    expect(days[0]?.notes.join(' ')).toContain('Umfang vor Intensität')
  })
})

describe('ending a break early', () => {
  it('frees today', () => {
    const running = entry('illness', 3, 14)
    const shortened = endedBefore(running, TODAY)
    expect(shortened).not.toBeNull()
    expect(breakLimit(shortened ? [shortened] : [], TODAY)).toBeNull()
  })

  it('drops a break stopped on the day it started', () => {
    expect(endedBefore(entry('illness', 0, 14), TODAY)).toBeNull()
  })
})
