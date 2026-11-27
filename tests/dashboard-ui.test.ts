import { describe, expect, it } from 'vitest'
import { analyzeSteady, buildDashboardSummary } from '../src/coach/dashboard.ts'
import type { BlockReading, RideTrace } from '../src/coach/dashboard.ts'
import type { SteadyBlock } from '../src/coach/steady-block.ts'
import { STEADY_THRESHOLDS } from '../src/coach/steady-block.ts'
import type { Activity, RideStats } from '../src/coach/types.ts'
import { seriesPath, traceGeometry, weekChart } from '../src/ui/dashboard/geometry.ts'
import { coverageLine, findingItems, pct, rideRows, shortDate, verdictSentence, warnedWeeks } from '../src/ui/dashboard/model.ts'
import { ApiError } from '../src/ui/api.ts'
import { pendingBatches, RATE_WAIT_MS, retryWhenThrottled } from '../src/ui/dashboard/useDashboard.ts'
import { activity, TODAY } from './fixtures.ts'

const stats: RideStats = {
  averageWatts: 200,
  normalizedWatts: 204,
  efficiencyFactor: 1.45,
  variabilityIndex: 1.02,
  decouplingPct: 3.1,
  indoor: true,
}
const ride = (daysAgo: number, id: string): Activity => activity(daysAgo, 'Ride', { id, rideStats: stats })
const block = (first: number, second: number): SteadyBlock => ({
  startS: 600,
  durationS: 2400,
  avgWatts: 200,
  avgHeartRate: 200 * first,
  firstHalfHrPerW: first,
  secondHalfHrPerW: second,
})
const reading = (id: string, b: SteadyBlock | null): [string, BlockReading] => [id, { id, status: b ? 'block' : 'noBlock', block: b }]

const setup = () => {
  const summary = buildDashboardSummary([ride(1, 'drift'), ride(2, 'intervals'), ride(8, 'calm')], TODAY, 2)
  const readings = new Map([reading('drift', block(0.7, 0.75)), reading('intervals', null), reading('calm', block(0.7, 0.7))])
  return { summary, readings, analysis: analyzeSteady(summary, readings) }
}

describe('dashboard text', () => {
  it('writes German numbers and dates', () => {
    expect(pct(0.0714)).toBe('+7,1 %')
    expect(pct(-0.02)).toBe('−2,0 %')
    expect(shortDate('2026-09-03')).toBe('Do 03.09.')
  })

  it('lists warnings first, then rides the rules skipped', () => {
    const { summary, analysis } = setup()
    const items = findingItems(summary, analysis)
    expect(items.map((i) => [i.rideId, i.tone])).toEqual([
      ['drift', 'warn'],
      ['intervals', 'muted'],
    ])
    expect(items[0]?.code).toBe('Warnung 01 · Puls-Drift')
    expect(items[0]?.line).toBe('+7,1 % zweite Blockhälfte')
  })

  it('stands in the newest calm ride when nothing warns', () => {
    const summary = buildDashboardSummary([ride(1, 'calm')], TODAY, 1)
    const analysis = analyzeSteady(summary, new Map([reading('calm', block(0.7, 0.7))]))
    expect(findingItems(summary, analysis).map((i) => i.tone)).toEqual(['calm'])
  })

  it('explains every verdict, a missing block included', () => {
    const { analysis } = setup()
    const drift = analysis.findings.filter((f) => f.activityId === 'drift')
    expect(verdictSentence('noBaseline', drift, block(0.7, 0.75), STEADY_THRESHOLDS)).toContain('+7,1 %')
    expect(verdictSentence('noBlock', [], null, STEADY_THRESHOLDS)).toContain('keine Aussage')
    expect(verdictSentence('skipped', [], null, STEADY_THRESHOLDS)).toContain('40 Minuten')
  })

  it('fills the table and the coverage line from what was read', () => {
    const { summary, analysis, readings } = setup()
    const rows = rideRows(summary, analysis, readings)
    expect(rows.map((r) => [r.ride.id, r.status, r.steady])).toEqual([
      ['drift', 'Warnung', '40 min · +7,1 %'],
      ['intervals', 'Kein Block', '–'],
      ['calm', 'Ohne Basis', '40 min · +0,0 %'],
    ])
    expect(coverageLine(analysis.coverage)).toBe('2 ohne Basis · 1 ohne Block')
  })

  it('marks the week that holds a finding', () => {
    const { summary, analysis } = setup()
    expect(warnedWeeks(summary, analysis.findings)).toEqual([false, true])
  })
})

describe('retryWhenThrottled', () => {
  const failing = (errors: readonly Error[]) => {
    let calls = 0
    return {
      call: async (): Promise<string> => {
        const error = errors[calls++]
        if (error) throw error
        return 'ok'
      },
      calls: () => calls,
    }
  }
  const waits: number[] = []
  const wait = async (ms: number) => {
    waits.push(ms)
  }

  it('waits for the rate window and asks again after a 429', async () => {
    waits.length = 0
    const api = failing([new ApiError('busy', 429), new ApiError('busy', 429)])
    await expect(retryWhenThrottled(api.call, wait)).resolves.toBe('ok')
    expect(api.calls()).toBe(3)
    expect(waits).toEqual([RATE_WAIT_MS, RATE_WAIT_MS])
  })

  it('gives up after a minute of 429s and passes other errors on at once', async () => {
    waits.length = 0
    const busy = failing(Array(10).fill(new ApiError('busy', 429)))
    await expect(retryWhenThrottled(busy.call, wait)).rejects.toThrow('busy')
    expect(waits.length * RATE_WAIT_MS).toBeGreaterThanOrEqual(60_000)
    const broken = failing([new ApiError('down', 502)])
    await expect(retryWhenThrottled(broken.call, wait)).rejects.toThrow('down')
    expect(broken.calls()).toBe(1)
  })
})

describe('pendingBatches', () => {
  it('skips rides read before and cuts the rest into batches', () => {
    const rides = Array.from({ length: 6 }, (_v, i) => ride(i + 1, `r${i}`))
    const summary = buildDashboardSummary(rides, TODAY, 2)
    expect(pendingBatches(summary, new Map([reading('r0', null)]))).toEqual([['r1', 'r2', 'r3', 'r4'], ['r5']])
  })
})

describe('dashboard geometry', () => {
  it('puts the bars and the chronic line on one scale', () => {
    const { summary } = setup()
    const chart = weekChart(summary.weeks, 100, 50)
    expect(chart.bars).toHaveLength(2)
    expect(Math.max(...chart.bars.map((b) => b.height))).toBeLessThanOrEqual(50)
    expect(chart.chronicPath.startsWith('M')).toBe(true)
  })

  it('breaks a series where a week has no value', () => {
    expect(seriesPath([1.3, null, 1.4], [10, 20, 30], 50).path.match(/M/g)).toHaveLength(2)
    expect(seriesPath([null], [10], 50).path).toBe('')
  })

  it('breaks the trace at a pause instead of bridging it', () => {
    const minute = (m: number) => ({ minute: m, samples: 60, watts: 200, heartRate: 140 })
    const trace: RideTrace = { minutes: [minute(0), minute(1), minute(5), minute(6)], block: null, warmupS: 600 }
    const g = traceGeometry(trace)
    expect(g.powerPath.match(/M/g)).toHaveLength(2)
    expect(g.x(6)).toBe(1000)
    expect(g.yPower(0)).toBeGreaterThan(g.yPower(200))
  })
})
