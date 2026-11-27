import { describe, expect, it } from 'vitest'
import {
  detectElevatedHr,
  detectHrDrift,
  detectSteadyFindings,
  findSteadyBlock,
  minuteBuckets,
  STEADY_THRESHOLDS as T,
  type MinuteBucket,
  type RideMetrics,
} from '../src/coach/steady-block.ts'

const WARMUP_MIN = T.warmupS / 60
const DAY0 = Date.parse('2026-10-01T17:00:00Z')

const minutes = (power: readonly number[], hr?: readonly number[], start = 0): MinuteBucket[] =>
  power.map((watts, i) => ({ minute: start + i, samples: 60, watts, heartRate: hr?.[i] ?? 140 }))

const repeat = (value: number, count: number): number[] => new Array<number>(count).fill(value)

const ride = (
  activityId: string,
  day: number,
  opts: { watts?: number; first?: number; second?: number; indoor?: boolean; steady?: boolean } = {},
): RideMetrics => {
  const { watts = 180, first = 0.7, second = 0.71, indoor = true, steady = true } = opts
  return {
    activityId,
    start: new Date(DAY0 + day * 86_400_000).toISOString(),
    indoor,
    block: steady
      ? { startS: T.warmupS, durationS: 2400, avgWatts: watts, avgHeartRate: watts * first, firstHalfHrPerW: first, secondHalfHrPerW: second }
      : null,
  }
}

const baseline = (days = [0, 7, 14], opts: { watts?: number; indoor?: boolean } = {}): RideMetrics[] =>
  days.map((d) => ride(`base-${d}`, d, { ...opts, first: 0.7 }))

describe('minuteBuckets', () => {
  it('averages each minute and skips samples without power or heart rate', () => {
    const time = [0, 1, 2, 60, 61]
    const buckets = minuteBuckets(time, [100, null, 200, 300, 300], [120, 130, 140, 150, null])
    expect(buckets).toEqual([
      { minute: 0, samples: 2, watts: 150, heartRate: 130 },
      { minute: 1, samples: 1, watts: 300, heartRate: 150 },
    ])
  })
})

describe('findSteadyBlock', () => {
  it('skips the warm-up even at the same power', () => {
    const block = findSteadyBlock(minutes(repeat(200, 40)))
    expect(block?.startS).toBe(T.warmupS)
    expect(block?.durationS).toBe((40 - WARMUP_MIN) * 60)
  })

  it('takes the halves inside the block only', () => {
    const hr = [...repeat(100, WARMUP_MIN), ...repeat(140, 15), ...repeat(154, 15)]
    const block = findSteadyBlock(minutes(repeat(200, WARMUP_MIN + 30), hr))
    expect(block?.firstHalfHrPerW).toBeCloseTo(0.7)
    expect(block?.secondHalfHrPerW).toBeCloseTo(0.77)
    expect(block?.avgWatts).toBeCloseTo(200)
  })

  it('finds no block in an interval session', () => {
    const intervals = Array.from({ length: 7 }, () => [...repeat(260, 4), ...repeat(130, 3)]).flat()
    expect(findSteadyBlock(minutes([...repeat(150, WARMUP_MIN), ...intervals]))).toBeNull()
  })

  it('takes the longest run and tolerates the allowed spread', () => {
    const spreadOk = 200 * (1 + T.powerSpread) - 1
    const alternating = Array.from({ length: 16 }, () => [200, spreadOk]).flat()
    const power = [...repeat(150, WARMUP_MIN), ...repeat(300, 5), ...alternating, ...repeat(100, 5)]
    const block = findSteadyBlock(minutes(power))
    expect(block?.startS).toBe((WARMUP_MIN + 5) * 60)
    expect(block?.durationS).toBe(32 * 60)
  })

  it('ends a block at a pause or a minute without power', () => {
    const before = minutes(repeat(200, 25), undefined, WARMUP_MIN)
    const afterPause = minutes(repeat(200, 25), undefined, WARMUP_MIN + 26)
    const withStop = minutes([...repeat(200, 25), 0, ...repeat(200, 25)], undefined, WARMUP_MIN)
    expect(findSteadyBlock([...before, ...afterPause])).toBeNull()
    expect(findSteadyBlock(withStop)).toBeNull()
  })

  it('needs the minimum duration', () => {
    const tooShort = T.minDurationS / 60 - 1
    expect(findSteadyBlock(minutes(repeat(200, WARMUP_MIN + tooShort)))).toBeNull()
    expect(findSteadyBlock(minutes(repeat(200, WARMUP_MIN + tooShort + 1)))).not.toBeNull()
  })
})

describe('detectHrDrift', () => {
  it.each([
    [0.7 * 1.04, null],
    [0.7 * 1.06, 'moderate'],
    [0.7 * 1.12, 'high'],
  ] as const)('puts second half %f into band %s', (second, severity) => {
    const hits = detectHrDrift([ride('s', 0, { second })])
    expect(hits.map((h) => h.severity)).toEqual(severity ? [severity] : [])
  })

  it('reports the numbers behind the hit', () => {
    const [hit] = detectHrDrift([ride('s', 0, { second: 0.77, indoor: false })])
    expect(hit).toMatchObject({ rule: 'hrDrift', observedHrPerW: 0.77, referenceHrPerW: 0.7, threshold: T.hrDrift, indoor: false })
    expect(hit?.deviation).toBeCloseTo(0.1)
  })

  it('gives no verdict without a steady block', () => {
    const rides = [...baseline(), ride('intervals', 21, { first: 0.8, second: 0.95, steady: false })]
    expect(detectHrDrift(rides)).toEqual([])
    expect(detectElevatedHr(rides)).toEqual([])
  })
})

describe('detectElevatedHr', () => {
  it('compares with earlier rides at similar power', () => {
    const [hit] = detectElevatedHr([...baseline(), ride('high', 21, { first: 0.75 })])
    expect(hit).toMatchObject({ activityId: 'high', severity: null, referenceHrPerW: 0.7, referenceRides: 3 })
    expect(hit?.deviation).toBeCloseTo(0.071, 3)
  })

  it('never compares indoor with outdoor', () => {
    expect(detectElevatedHr([...baseline(undefined, { indoor: false }), ride('high', 21, { first: 0.8 })])).toEqual([])
  })

  it('ignores earlier rides without a steady block', () => {
    const rides = [...baseline([0, 7]), ride('intervals', 14, { steady: false }), ride('high', 21, { first: 0.8 })]
    expect(detectElevatedHr(rides)).toEqual([])
  })

  it('ignores rides at other power', () => {
    expect(detectElevatedHr([...baseline(undefined, { watts: 162 }), ride('high', 21, { first: 0.8 })])).toEqual([])
  })

  it('uses only the window before the ride', () => {
    const tooOld = T.baselineDays + 1
    const rides = [...baseline([0, 1, 2]), ride('high', tooOld + 2, { first: 0.8 }), ...baseline([tooOld + 3, tooOld + 4, tooOld + 5])]
    expect(detectElevatedHr(rides)).toEqual([])
  })
})

describe('detectSteadyFindings', () => {
  it('reports only rides since the start, sorted by time', () => {
    const rides = [...baseline(), ride('old-drift', 1, { second: 0.8 }), ride('new', 21, { first: 0.8, second: 0.9 })]
    const since = new Date(DAY0 + 20 * 86_400_000).toISOString()
    const hits = detectSteadyFindings(rides, since)
    expect(hits.map((h) => [h.activityId, h.rule])).toEqual([
      ['new', 'elevatedHr'],
      ['new', 'hrDrift'],
    ])
  })
})
