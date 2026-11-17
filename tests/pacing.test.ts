import { describe, expect, it } from 'vitest'
import { pacingPlan, pacingSteps, pacingTarget, racePacing } from '../src/coach/pacing.ts'
import { goalRaceTemplate } from '../src/coach/goal-race.ts'
import { toIntervalsText } from '../src/coach/format.ts'
import type { Goal } from '../src/coach/types.ts'
import { config } from './fixtures.ts'

const race = (distanceKm: number, targetValue: number, overrides: Partial<Goal> = {}): Goal => ({
  id: `race-${distanceKm}`,
  sport: 'Run',
  kind: 'raceTime',
  label: `${distanceKm} km`,
  targetValue,
  currentValue: targetValue + 120,
  distanceKm,
  targetDate: '2027-04-11',
  priority: 'A',
  ...overrides,
})

const total = (segments: ReturnType<typeof pacingPlan>) =>
  segments.reduce((sum, segment) => sum + (segment.toKm - segment.fromKm) * segment.secPerKm, 0)

describe('pacing a race', () => {
  it.each([
    [5, 1200],
    [10, 2580],
    [21.0975, 5700],
    [42.195, 12600],
  ])('covers %s km and adds up to the target', (km, seconds) => {
    const segments = pacingPlan(km, seconds)
    expect(segments[0]?.fromKm).toBe(0)
    expect(segments.at(-1)?.toKm).toBe(km)
    segments.slice(1).forEach((segment, index) => expect(segment.fromKm).toBe(segments[index]!.toKm))
    expect(Math.abs(total(segments) - seconds)).toBeLessThan(km)
  })

  it('starts controlled and finishes faster than the even middle', () => {
    const [start, middle, finish] = pacingPlan(10, 2580)
    expect(start?.secPerKm).toBeGreaterThan(middle!.secPerKm)
    expect(finish?.secPerKm).toBeLessThan(middle!.secPerKm)
  })

  it('keeps a marathon to a handful of steps the watch can hold', () => {
    expect(pacingPlan(42.195, 12600).length).toBeLessThanOrEqual(8)
  })

  it('paces on the goal where the forecast holds it possible', () => {
    expect(pacingTarget(race(10, 2400), { best: 2350, likely: 2430, worst: 2520 })).toEqual({ targetSeconds: 2400, basis: 'goal' })
  })

  it('paces on the likely time where the goal is out of reach', () => {
    expect(pacingTarget(race(10, 2200), { best: 2350, likely: 2430, worst: 2520 })).toEqual({
      targetSeconds: 2430,
      basis: 'forecast-goal-out-of-reach',
    })
  })

  it('paces on the likely time where the goal is slower than the worst case', () => {
    expect(pacingTarget(race(10, 2700), { best: 2350, likely: 2430, worst: 2520 }).basis).toBe('forecast-goal-safe')
  })

  it('writes absolute pace ranges by distance for intervals.icu', () => {
    const pacing = racePacing(race(21.0975, 5700), null)!
    const text = toIntervalsText(pacingSteps(pacing))
    expect(text).toMatch(/^- 4km \d:\d\d-\d:\d\d\/km Pace Start kontrolliert/)
    expect(text).toContain('3098mtr')
  })

  it('has nothing to pace without a distance, or off foot', () => {
    expect(racePacing(race(10, 2400, { distanceKm: undefined }), null)).toBeNull()
    expect(racePacing(race(10, 2400, { sport: 'Swim' }), null)).toBeNull()
  })
})

describe('race day as a session', () => {
  it('carries the pacing for a run, after the warm-up', () => {
    const template = goalRaceTemplate(race(10, 2400), config, { best: 2350, likely: 2430, worst: 2520 })
    expect(template.blocks).toHaveLength(4)
    expect(template.coachNote).toContain('40:00')
  })

  it('keeps one race step where there is no distance', () => {
    const template = goalRaceTemplate(race(10, 2400, { distanceKm: undefined }), config)
    expect(template.blocks).toHaveLength(2)
  })
})
