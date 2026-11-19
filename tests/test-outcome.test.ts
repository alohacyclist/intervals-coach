import { describe, expect, it } from 'vitest'
import { thresholdFromStreams } from '../src/coach/test-result.ts'
import { testOutcome } from '../src/coach/test-outcome.ts'
import type { ActivityStreams } from '../src/coach/trace.ts'
import type { SportThreshold } from '../src/coach/types.ts'

const RUN: SportThreshold = { metric: 'pace', thresholdSecPerKm: 241 }
const RIDE: SportThreshold = { metric: 'power', ftp: 280 }

/** One sample a second: each piece holds a value for so many minutes. */
const recording = (pieces: readonly (readonly [minutes: number, value: number | null])[]) => {
  const values = pieces.flatMap(([minutes, value]) => new Array<number | null>(minutes * 60).fill(value))
  return { time: values.map((_value, index) => index), values }
}

const run = (pieces: readonly (readonly [number, number | null])[], withDistance = true): ActivityStreams => {
  const { time, values } = recording(pieces)
  let metres = 0
  const distance = values.map((speed) => {
    const at = metres
    metres += speed ?? 0
    return at
  })
  return { time, watts: null, speed: values, heartRate: null, ...(withDistance ? { distance } : {}) }
}

const ride = (pieces: readonly (readonly [number, number | null])[]): ActivityStreams => {
  const { time, values } = recording(pieces)
  return { time, watts: values, speed: null, heartRate: null }
}

/** Metres per second for a pace in seconds per kilometre. */
const pace = (secondsPerKm: number) => 1000 / secondsPerKm

describe('reading the test off the recording', () => {
  it('takes the best twenty minutes of a run, not the warm-up around them', () => {
    const test = run([
      [12, pace(330)],
      [20, pace(227)],
      [6, pace(320)],
    ])
    expect(thresholdFromStreams('Run', test, RUN)).toEqual({ metric: 'pace', average: 227, value: 238, percent: 106 })
  })

  it('reads speed when the run has no distance stream', () => {
    const test = run([
      [12, pace(330)],
      [20, pace(227)],
      [6, pace(320)],
    ], false)
    expect(thresholdFromStreams('Run', test, RUN)?.value).toBe(238)
  })

  it('takes ninety five percent of the best twenty minutes of a ride', () => {
    const test = ride([
      [15, 160],
      [20, 300],
      [10, 150],
    ])
    expect(thresholdFromStreams('Ride', test, RIDE)).toEqual({ metric: 'power', average: 300, value: 285, percent: 107 })
  })

  it('counts a hole in the recording as nothing done', () => {
    const test = ride([
      [9, 300],
      [2, null],
      [9, 300],
      [1, 100],
    ])
    // Twenty minutes of it, two of them empty: 18 × 300 ÷ 20.
    expect(thresholdFromStreams('Ride', test, RIDE)?.average).toBe(270)
  })

  it('says nothing about a session shorter than the block', () => {
    expect(thresholdFromStreams('Ride', ride([[15, 300]]), RIDE)).toBeNull()
    expect(thresholdFromStreams('Run', run([]), RUN)).toBeNull()
  })
})

describe('what follows from the test', () => {
  it('calls a change under one percent a confirmation, and still offers it', () => {
    // 3:49/km for twenty minutes gives 4:00/km against 4:01: under half a percent.
    const outcome = testOutcome('Run', RUN, run([[12, pace(330)], [20, pace(229)], [6, pace(320)]]), [])
    expect(outcome?.measured).toBe(240)
    expect(outcome?.adoptable).toBe(true)
    expect(outcome?.message).toContain('3:49/km')
    expect(outcome?.message).toContain('Weniger als 1 %')
  })

  it('asks to adopt a clear gain', () => {
    const outcome = testOutcome('Ride', RIDE, ride([[15, 160], [20, 320], [10, 150]]), [])
    expect(outcome?.measured).toBe(304)
    expect(outcome?.message).toContain('8.6 % besser')
  })

  it('reads no value off a test that was given up', () => {
    const outcome = testOutcome('Ride', RIDE, ride([[15, 160], [20, 230], [10, 150]]), [])
    expect(outcome?.measured).toBeNull()
    expect(outcome?.adoptable).toBe(false)
    expect(outcome?.message).toContain('kein durchgezogener Test')
  })

  it('reads the pool test from the 400 and the 200', () => {
    const swim: SportThreshold = { metric: 'swimPace', cssSecPer100m: 100 }
    const efforts = [
      { seconds: 380, averageWatts: null, averageSpeedMps: 400 / 380 },
      { seconds: 240, averageWatts: null, averageSpeedMps: 200 / 240 },
      { seconds: 180, averageWatts: null, averageSpeedMps: 200 / 180 },
    ]
    const outcome = testOutcome('Swim', swim, null, efforts)
    expect(outcome?.measured).toBe(100)
    expect(outcome?.adoptable).toBe(false)
  })

  it('has nothing to say without a recording', () => {
    expect(testOutcome('Run', RUN, null, [])).toBeNull()
  })
})
