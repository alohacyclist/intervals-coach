import { describe, expect, it } from 'vitest'
import { benchmarkStatus, BENCHMARK_INTERVAL_WEEKS } from '../src/coach/benchmark.ts'
import type { Completion } from '../src/coach/progression.ts'
import { activity, config, TODAY, triConfig } from './fixtures.ts'
import { addDays } from '../src/coach/dates.ts'

const completion = (templateId: string, daysAgo: number, activityId: string): Completion => ({
  templateId,
  date: addDays(TODAY, -daysAgo),
  compliance: 90,
  activityId,
})

const ride = (daysAgo: number, id: string, hr: number | null) => ({
  ...activity(daysAgo, 'Ride', { load: 68 }),
  id,
  averageHr: hr,
})

describe('benchmark scheduling', () => {
  it('is due when nothing was ever done and the plan is old enough', () => {
    const old = { ...config, planStart: addDays(TODAY, -70) }
    expect(benchmarkStatus(old, [], [], TODAY).due).toBe(true)
  })

  it('is not due in the first weeks of a plan', () => {
    const fresh = { ...config, planStart: addDays(TODAY, -14) }
    expect(benchmarkStatus(fresh, [], [], TODAY).due).toBe(false)
  })

  it('resets the clock once one was completed', () => {
    const done = [completion('bench-bike-4x4', 7, 'a1')]
    const status = benchmarkStatus({ ...config, planStart: addDays(TODAY, -200) }, done, [ride(7, 'a1', 160)], TODAY)
    expect(status.due).toBe(false)
    expect(status.weeksSinceLast).toBe(1)
  })

  it('offers a reference session for every sport the athlete trains', () => {
    expect(benchmarkStatus(triConfig, [], [], TODAY).sessions.map((s) => s.sport)).toEqual([
      'Ride',
      'Run',
      'Swim',
    ])
  })

  it('uses an eight week interval', () => {
    expect(benchmarkStatus(config, [], [], TODAY).intervalWeeks).toBe(BENCHMARK_INTERVAL_WEEKS)
  })
})

describe('benchmark comparison', () => {
  const twice = (firstHr: number | null, secondHr: number | null) =>
    benchmarkStatus(
      config,
      [completion('bench-bike-4x4', 60, 'a1'), completion('bench-bike-4x4', 3, 'a2')],
      [ride(60, 'a1', firstHr), ride(3, 'a2', secondHr)],
      TODAY,
    ).results[0]

  it('calls a lower heart rate for the same work progress', () => {
    const result = twice(165, 158)
    expect(result?.verdict).toBe('better')
    expect(result?.message).toContain('Schläge weniger')
  })

  it('calls a higher heart rate a warning, not a failure', () => {
    const result = twice(158, 166)
    expect(result?.verdict).toBe('worse')
    expect(result?.message).toContain('wiederholen')
  })

  it('treats a couple of beats as noise', () => {
    expect(twice(160, 161)?.verdict).toBe('unchanged')
  })

  it('marks the first execution as a baseline', () => {
    const status = benchmarkStatus(config, [completion('bench-bike-4x4', 3, 'a1')], [ride(3, 'a1', 160)], TODAY)
    expect(status.results[0]?.verdict).toBe('first')
  })

  it('says so when there is no heart rate to compare', () => {
    expect(twice(null, null)?.verdict).toBe('unknown')
  })

  it('ignores ordinary sessions', () => {
    const status = benchmarkStatus(config, [completion('bike-thr-3x12', 3, 'a1')], [ride(3, 'a1', 160)], TODAY)
    expect(status.results).toEqual([])
    expect(status.weeksSinceLast).toBeNull()
  })
})
