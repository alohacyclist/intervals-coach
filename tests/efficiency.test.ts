import { describe, expect, it } from 'vitest'
import type { ExecutedStep, Execution } from '../src/coach/types.ts'
import type { WorkReading } from '../src/coach/efficiency.ts'
import { efficiencyChange, thresholdImplied, workReading } from '../src/coach/efficiency.ts'
import { compareBenchmarks } from '../src/coach/benchmark.ts'
import { executionSuggestion } from '../src/coach/threshold-drift.ts'
import { config } from './fixtures.ts'

const step = (actualPercent: number | null, heartRate: number | null, seconds = 240, low = 104, high = 108): ExecutedStep => ({
  index: 1,
  plannedSeconds: 240,
  low,
  high,
  actualSeconds: actualPercent === null ? null : seconds,
  actualPercent,
  actualValue: null,
  verdict: null,
  cutShort: false,
  pieces: actualPercent === null ? 0 : 1,
  span: null,
  heartRate,
})

const execution = (steps: readonly ExecutedStep[], unavailable: string | null = null): Execution =>
  ({ steps, unavailable }) as unknown as Execution

const reading = (percent: number, heartRate: number | null, deviation = 0, targetPercent = 106): WorkReading => ({
  percent,
  targetPercent,
  heartRate,
  deviation,
  seconds: 960,
})

describe('reading the work intervals', () => {
  it('weighs by time and ignores intervals that were not run', () => {
    const read = workReading(execution([step(100, 150, 300), step(110, 160, 100), step(null, null)]))
    expect(read?.percent).toBeCloseTo(102.5, 5)
    expect(read?.heartRate).toBeCloseTo(152.5, 5)
    expect(read?.seconds).toBe(400)
  })

  it('counts only what lay outside the band, from its nearer edge', () => {
    const read = workReading(execution([step(110, 160), step(106, 160), step(101, 160)]))
    // +2 above, 0 inside, −3 below, equal weights.
    expect(read?.deviation).toBeCloseTo(-1 / 3, 5)
  })

  it('leaves heart rate out when one interval has none', () => {
    expect(workReading(execution([step(106, 160), step(106, null)]))?.heartRate).toBeNull()
  })

  it('reads nothing where the comparison itself declined', () => {
    expect(workReading(execution([step(106, 160)], 'Keine Tempodaten'))).toBeNull()
  })
})

describe('efficiency', () => {
  it('is pace per beat: faster at the same heart rate is better', () => {
    expect(efficiencyChange(reading(106, 160), reading(103, 160))).toBeCloseTo((106 / 103 - 1) * 100, 5)
  })

  it('finds the threshold that would have put the work mid-band', () => {
    // 4 % above target: FTP up by 4 %, threshold pace 4 % fewer seconds per km.
    expect(thresholdImplied('power', 250, [reading(110.24, null, 0, 106)])).toBeCloseTo(260, 0)
    expect(thresholdImplied('pace', 260, [reading(110.24, null, 0, 106)])).toBeCloseTo(250, 0)
  })
})

describe('the reference session', () => {
  it('calls a faster run at a few more beats progress, not a loss', () => {
    const result = compareBenchmarks(
      'Run',
      { date: '2026-09-24', reading: reading(107, 164), averageHr: 150 },
      { date: '2026-07-29', reading: reading(101, 162), averageHr: 146 },
    )
    expect(result.basis).toBe('intervals')
    expect(result.verdict).toBe('better')
    expect(result.message).toContain('effizienter')
  })

  it('falls back to the whole activity when the intervals cannot be read', () => {
    const result = compareBenchmarks(
      'Run',
      { date: '2026-09-24', reading: null, averageHr: 150 },
      { date: '2026-07-29', reading: reading(101, 162), averageHr: 154 },
    )
    expect(result.basis).toBe('activity')
    expect(result.verdict).toBe('better')
  })

  it('sets a first reference without a comparison', () => {
    expect(compareBenchmarks('Run', { date: '2026-09-24', reading: reading(106, 160), averageHr: 150 }, null).verdict).toBe(
      'first',
    )
  })
})

describe('targets against what was done', () => {
  const run = (deviation: number, percent: number) => ({ date: '2026-09-24', reading: reading(percent, 160, deviation) })

  it('suggests a faster threshold after two sessions well above the band', () => {
    const suggestion = executionSuggestion(config.profile, 'Run', [run(4, 112), { ...run(3.5, 111.5), date: '2026-09-20' }])
    expect(suggestion?.action).toBe('adopt')
    expect(suggestion?.driftPercent).toBeGreaterThan(0)
    expect(suggestion?.message).toContain('20.09. und 24.09.')
  })

  it('stays quiet after one session, or when only one of two was off', () => {
    expect(executionSuggestion(config.profile, 'Run', [run(4, 112)])).toBeNull()
    expect(executionSuggestion(config.profile, 'Run', [run(4, 112), run(1, 108)])).toBeNull()
  })

  it('asks to verify, not to adopt, after two sessions well below', () => {
    expect(executionSuggestion(config.profile, 'Run', [run(-4, 99), run(-3.2, 100)])?.action).toBe('verify')
  })
})
