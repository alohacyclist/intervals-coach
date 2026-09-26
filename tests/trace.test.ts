import { describe, expect, it } from 'vitest'
import { buildTrace, inTargetRuns } from '../src/coach/trace.ts'
import type { ActivityStreams } from '../src/coach/trace.ts'
import type { ExecutionTrace, SportThreshold } from '../src/coach/types.ts'

const FTP: SportThreshold = { metric: 'power', ftp: 250 }
const PACE: SportThreshold = { metric: 'pace', thresholdSecPerKm: 240 }

const seconds = (count: number, from = 0): readonly number[] => Array.from({ length: count }, (_, index) => from + index)

const ride = (watts: readonly (number | null)[], heartRate: readonly (number | null)[] | null = null): ActivityStreams => ({
  time: seconds(watts.length),
  watts,
  speed: null,
  heartRate,
})

describe('the session over time', () => {
  it('draws power as a share of FTP, five seconds to a point', () => {
    const trace = buildTrace(ride(Array(600).fill(250)), FTP)
    expect(trace?.step).toBe(5)
    expect(trace?.points).toHaveLength(120)
    expect(trace?.points.every((point) => point.percent === 100 && point.value === 250)).toBe(true)
  })

  it('reads a faster pace as more than threshold, like more watts', () => {
    const run: ActivityStreams = { time: seconds(300), watts: null, speed: Array(300).fill(1000 / 230), heartRate: null }
    const trace = buildTrace(run, PACE)
    expect(trace?.points[10]?.percent).toBe(104)
    expect(trace?.smoothing).toBe(30)
  })

  it('draws nothing for a pool swim or without the stream the metric needs', () => {
    const swim: ActivityStreams = { time: seconds(60), watts: null, speed: Array(60).fill(1), heartRate: null }
    expect(buildTrace(swim, { metric: 'swimPace', cssSecPer100m: 100 })).toBeNull()
    expect(buildTrace({ ...ride([]), watts: null }, FTP)).toBeNull()
    expect(buildTrace(ride(Array(60).fill(null)), FTP)).toBeNull()
  })

  it('keeps a paused recording as a gap instead of an easy minute', () => {
    const paused: ActivityStreams = {
      time: [...seconds(100), ...seconds(100, 200)],
      watts: Array(200).fill(250),
      speed: null,
      heartRate: null,
    }
    const trace = buildTrace(paused, FTP) as ExecutionTrace
    const during = trace.points.filter((point) => point.seconds >= 100 && point.seconds < 200)
    expect(during.length).toBeGreaterThan(0)
    expect(during.every((point) => point.percent === null)).toBe(true)
  })

  it('bridges the sparse samples of smart recording instead of breaking the line', () => {
    // A sample every seven seconds leaves every few five-second slots empty.
    const time = Array.from({ length: 60 }, (_, index) => index * 7)
    const sparse: ActivityStreams = { time, watts: Array(60).fill(250), speed: null, heartRate: Array(60).fill(140) }
    const trace = buildTrace(sparse, FTP) as ExecutionTrace
    expect(trace.points.every((point) => point.percent === 100 && point.heartRate === 140)).toBe(true)
  })

  it('keeps a five hour ride to a few hundred points', () => {
    const trace = buildTrace(ride(Array(5 * 3600).fill(200)), FTP) as ExecutionTrace
    expect(trace.points.length).toBeLessThanOrEqual(721)
    expect(trace.step % 5).toBe(0)
    expect(trace.seconds).toBe(5 * 3600 - 1)
  })

  it('averages heart rate per point and ignores dropouts reported as zero', () => {
    const trace = buildTrace(ride(Array(10).fill(250), [150, 152, 0, 154, 150, 160, 160, 160, 160, 160]), FTP)
    expect(trace?.points[0]?.heartRate).toBe(152)
    expect(trace?.points[1]?.heartRate).toBe(160)
  })

  it('evens out a single spike over ten seconds of power', () => {
    const spiky = [...Array(20).fill(250), ...Array(5).fill(500), ...Array(20).fill(250)]
    const trace = buildTrace(ride(spiky), FTP) as ExecutionTrace
    const peak = Math.max(...trace.points.map((point) => point.percent ?? 0))
    expect(peak).toBeLessThan(200)
    expect(peak).toBeGreaterThan(100)
  })
})

describe('time inside the band', () => {
  const trace = (percents: readonly (number | null)[]): ExecutionTrace => ({
    seconds: percents.length * 5,
    step: 5,
    smoothing: 10,
    points: percents.map((percent, index) => ({ seconds: index * 5, percent, value: null, heartRate: null })),
  })

  it('joins neighbouring points inside the band into one stretch', () => {
    const runs = inTargetRuns(trace([90, 100, 101, 104, 110, 99, 98]), { from: 0, to: 35 }, 95, 105)
    expect(runs).toEqual([
      { from: 5, to: 20 },
      { from: 25, to: 35 },
    ])
  })

  it('stays within the interval it is asked about', () => {
    const runs = inTargetRuns(trace([100, 100, 100, 100, 100, 100]), { from: 7, to: 22 }, 95, 105)
    expect(runs).toEqual([{ from: 7, to: 22 }])
  })

  it('leaves a gap where nothing was recorded', () => {
    expect(inTargetRuns(trace([100, null, 100]), { from: 0, to: 15 }, 95, 105)).toEqual([
      { from: 0, to: 5 },
      { from: 10, to: 15 },
    ])
  })
})
