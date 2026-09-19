import { describe, expect, it } from 'vitest'
import type { Step } from '../src/coach/types.ts'
import { intensityOfPercent, profileOf } from '../src/coach/profile.ts'
import { findTemplate } from '../src/coach/library.ts'
import { BIKE_THRESHOLD, RUN_THRESHOLD } from './fixtures.ts'

const step = (duration: string, target: string, label?: string): Step =>
  label === undefined
    ? { kind: 'step', duration, target }
    : { kind: 'step', duration, target, label }

describe('intensityOfPercent', () => {
  it('splits at threshold and at the recovery line', () => {
    expect(intensityOfPercent(120)).toBe('hard')
    expect(intensityOfPercent(95)).toBe('hard')
    expect(intensityOfPercent(94)).toBe('moderate')
    expect(intensityOfPercent(80)).toBe('moderate')
    expect(intensityOfPercent(79)).toBe('easy')
    expect(intensityOfPercent(55)).toBe('easy')
  })
})

describe('profileOf', () => {
  it('turns timed steps into segments carrying width, height and class', () => {
    const profile = profileOf(
      [step('12m', '55%', 'Einfahren'), step('8m', '100%'), step('5m', '50%', 'Ausfahren')],
      BIKE_THRESHOLD,
    )
    expect(profile).toEqual([
      { seconds: 720, percent: 55, intensity: 'easy', label: 'Einfahren' },
      { seconds: 480, percent: 100, intensity: 'hard', label: null },
      { seconds: 300, percent: 50, intensity: 'easy', label: 'Ausfahren' },
    ])
  })

  it('expands a repeat, so four intervals are drawn as four blocks', () => {
    const profile = profileOf(
      [{ kind: 'repeat', times: 4, steps: [step('4m', '110%'), step('3m', '55%')] }],
      BIKE_THRESHOLD,
    )
    expect(profile).toHaveLength(8)
    expect(profile.filter((segment) => segment.intensity === 'hard')).toHaveLength(4)
  })

  it('gives a ramp the height of its middle, not of either end', () => {
    const [ramp] = profileOf([step('15m', 'ramp 50%-72%')], BIKE_THRESHOLD)
    expect(ramp?.percent).toBe(61)
    expect(ramp?.intensity).toBe('easy')
  })

  it('measures a distance step through the athlete pace', () => {
    // 236 s/km threshold: a kilometre at threshold is 236 s wide.
    const [interval] = profileOf([step('1km', '98-102% Pace')], RUN_THRESHOLD)
    expect(interval?.seconds).toBe(236)
    expect(interval?.intensity).toBe('hard')
  })

  it('places a step without any percentage at recovery level', () => {
    const [drill] = profileOf([step('200mtr', 'Technik')], RUN_THRESHOLD)
    expect(drill?.percent).toBe(60)
    expect(drill?.intensity).toBe('easy')
  })

  it('covers a real template end to end without gaps', () => {
    const template = findTemplate('bike-vo2-5x4')
    expect(template).toBeDefined()
    const profile = profileOf(template!.blocks, BIKE_THRESHOLD)
    expect(profile.length).toBeGreaterThan(5)
    const minutes = profile.reduce((sum, segment) => sum + segment.seconds, 0) / 60
    // The drawn width has to be the session the athlete was promised.
    expect(Math.abs(minutes - template!.minutes)).toBeLessThanOrEqual(5)
    expect(profile.every((segment) => segment.seconds > 0)).toBe(true)
  })
})
