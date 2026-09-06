import { describe, expect, it } from 'vitest'
import { computeFitness, ewmaSeries, inferStimulus, isHardActivity, projectFitness, rampRate } from '../src/coach/fitness.ts'
import { activity, TODAY } from './fixtures.ts'

describe('fitness', () => {
  it('converges towards the constant load', () => {
    const series = ewmaSeries(new Array(400).fill(50), 42)
    expect(series[series.length - 1]).toBeCloseTo(50, 1)
  })

  it('builds fitness from training load and reports negative form when fatigued', () => {
    const activities = Array.from({ length: 20 }, (_unused, index) => activity(index, 'Ride', { load: 80 }))
    const fitness = computeFitness(activities, TODAY)
    expect(fitness.ctl).toBeGreaterThan(0)
    expect(fitness.atl).toBeGreaterThan(fitness.ctl)
    expect(fitness.tsb).toBeLessThan(0)
  })

  it('separates fitness by sport', () => {
    const activities = [activity(1, 'Ride', { load: 100 }), activity(2, 'Run', { load: 10 })]
    expect(computeFitness(activities, TODAY, 'Ride').atl).toBeGreaterThan(
      computeFitness(activities, TODAY, 'Run').atl,
    )
  })

  it('reports a positive ramp rate while load is increasing', () => {
    const activities = Array.from({ length: 7 }, (_unused, index) => activity(index, 'Ride', { load: 120 }))
    expect(rampRate(activities, TODAY)).toBeGreaterThan(0)
  })

  it('projects one further day of load', () => {
    const projected = projectFitness({ ctl: 50, atl: 50, tsb: 0 }, 100)
    expect(projected.atl).toBeGreaterThan(projected.ctl)
  })

  it('infers stimulus from intensity and duration', () => {
    expect(inferStimulus(activity(1, 'Ride', { intensity: 105 }))).toBe('VO2')
    expect(inferStimulus(activity(1, 'Ride', { intensity: 95 }))).toBe('THRESHOLD')
    expect(inferStimulus(activity(1, 'Ride', { intensity: 86 }))).toBe('SWEETSPOT')
    expect(inferStimulus(activity(1, 'Run', { intensity: 60, movingTimeSec: 7200 }))).toBe('LONG')
    expect(inferStimulus(activity(1, 'Run', { intensity: 55, movingTimeSec: 1800 }))).toBe('RECOVERY')
    expect(inferStimulus(activity(1, 'Run', { intensity: 70, movingTimeSec: 3600 }))).toBe('ENDURANCE')
  })

  it('treats high intensity or very high load as hard', () => {
    expect(isHardActivity(activity(1, 'Ride', { intensity: 95 }))).toBe(true)
    expect(isHardActivity(activity(1, 'Ride', { intensity: 65, load: 95 }))).toBe(true)
    expect(isHardActivity(activity(1, 'Ride', { intensity: 65, load: 40 }))).toBe(false)
  })

  it('returns an empty snapshot when there is no history', () => {
    expect(computeFitness([], TODAY)).toEqual({ ctl: 0, atl: 0, tsb: 0 })
  })
})

describe('what counts as a hard session', () => {
  it('ignores a short run however intense it felt', () => {
    expect(isHardActivity(activity(1, 'Run', { intensity: 86, load: 37 }))).toBe(false)
  })

  it('counts a quality session of normal length', () => {
    expect(isHardActivity(activity(1, 'Ride', { intensity: 85, load: 51 }))).toBe(true)
  })

  it('counts a very long session even at moderate intensity', () => {
    expect(isHardActivity(activity(1, 'Ride', { intensity: 70, load: 95 }))).toBe(true)
  })

  it('still describes the character of a short intense effort', () => {
    // The stimulus stays sweetspot; only the weekly hard budget ignores it.
    expect(inferStimulus(activity(1, 'Run', { intensity: 86, load: 37 }))).toBe('SWEETSPOT')
  })
})

describe('classifying by time in zone', () => {
  const zoned = (zones: Record<string, number>, overrides = {}) =>
    activity(1, 'Ride', { intensity: 85, movingTimeSec: 2940, zoneSeconds: zones, ...overrides })

  it('reads a threshold session that averages out as sweetspot', () => {
    // The real shape of 3x8min at threshold: 23 minutes in Z4, IF only 85.
    expect(inferStimulus(zoned({ Z1: 844, Z2: 260, Z3: 11, Z4: 1427, SS: 1432 }))).toBe('THRESHOLD')
  })

  it('reads a VO2max session that averages out as threshold', () => {
    expect(inferStimulus(zoned({ Z1: 900, Z2: 400, Z4: 300, Z5: 900 }))).toBe('VO2')
  })

  it('still calls a genuine sweetspot session sweetspot', () => {
    expect(inferStimulus(zoned({ Z1: 600, Z2: 400, Z3: 500, Z4: 200, SS: 1100 }))).toBe('SWEETSPOT')
  })

  it('calls a steady tempo ride tempo', () => {
    expect(inferStimulus(zoned({ Z1: 500, Z2: 400, Z3: 1400 }))).toBe('TEMPO')
  })

  it('calls an easy spin recovery', () => {
    expect(inferStimulus(zoned({ Z1: 2600, Z2: 200 }, { movingTimeSec: 2800 }))).toBe('RECOVERY')
  })

  it('falls back to intensity when no zone data arrived', () => {
    expect(inferStimulus(activity(1, 'Ride', { intensity: 95, zoneSeconds: {} }))).toBe('THRESHOLD')
  })

  it('makes such a session count as hard again', () => {
    const session = zoned({ Z1: 844, Z2: 260, Z4: 1427 }, { load: 51 })
    expect(isHardActivity(session)).toBe(true)
  })
})
