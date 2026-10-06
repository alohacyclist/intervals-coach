import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExecutionView } from '../src/ui/components/ExecutionCard.tsx'
import { checkHeart, correctedHeartRate, withHeartCheck } from '../src/coach/heart-check.ts'
import { HeartCorrection } from '../src/ui/components/HeartCorrection.tsx'
import type { HeartCheck } from '../src/coach/heart-check.ts'
import { buildTrace } from '../src/coach/trace.ts'
import type { ActivityStreams } from '../src/coach/trace.ts'
import type { ExecutedStep, Execution, SportThreshold } from '../src/coach/types.ts'

const FTP: SportThreshold = { metric: 'power', ftp: 250 }
const PACE: SportThreshold = { metric: 'pace', thresholdSecPerKm: 240 }

/** The same "random" numbers every run, so a failure can be read again. */
const noise = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    const a = state / 2147483647
    state = (state * 16807) % 2147483647
    const b = state / 2147483647
    return Math.sqrt(-2 * Math.log(a + 1e-12)) * Math.cos(2 * Math.PI * b)
  }
}

/**
 * A heart as the tests imagine it: rising faster than it falls, climbing on
 * above threshold, drifting over the hour and flattening below its maximum —
 * deliberately not the shape the check fits, so a pass is not a tautology.
 */
const heartFor = (effort: readonly number[], seed = 1): number[] => {
  const random = noise(seed)
  let heart = 80
  let slow = 0
  return effort.map((percent, second) => {
    const target = 85 + 0.95 * percent
    heart += (target - heart) / (target > heart ? 30 : 60)
    slow += ((percent > 95 ? (percent - 95) * 0.25 : 0) - slow) / 120
    const raw = heart + slow + (6 * second) / 3600
    const flattened = raw < 180 ? raw : 190 - 10 * Math.exp(-(raw - 180) / 10)
    return flattened + random() * 1.5
  })
}

/** Share of threshold, second by second: warm-up, the blocks, cool-down. */
const effortOf = (blocks: readonly (readonly [number, number])[], seed = 2): number[] => {
  const random = noise(seed)
  return blocks.flatMap(([seconds, percent]) => Array.from({ length: seconds }, () => Math.max(0, percent + random() * 5)))
}

const THRESHOLD_RIDE = effortOf([
  [900, 60],
  [720, 102],
  [300, 52],
  [720, 102],
  [300, 52],
  [720, 102],
  [600, 52],
])

const ride = (effort: readonly number[], heart: readonly (number | null)[]): ActivityStreams => ({
  time: effort.map((_, second) => second),
  watts: effort.map((percent) => (percent * 250) / 100),
  speed: null,
  heartRate: heart,
})

const mean = (values: readonly (number | null)[]): number => {
  const known = values.filter((value): value is number => value !== null)
  return known.reduce((sum, value) => sum + value, 0) / known.length
}

/** The checked heart rate between two elapsed seconds. */
const checkedBetween = (check: HeartCheck, from: number, to: number) =>
  check.heart.slice(Math.floor(from / check.step), Math.ceil(to / check.step))

describe('checking a heart rate against the work', () => {
  it('leaves a clean recording alone, intervals and all', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const check = checkHeart(ride(THRESHOLD_RIDE, heartFor(THRESHOLD_RIDE, seed)), FTP, 190)
      expect(check?.faulty).toEqual([])
    }
    const vo2 = effortOf([[900, 60], ...Array.from({ length: 5 }, () => [[240, 120], [180, 45]] as const).flat(), [600, 52]])
    expect(checkHeart(ride(vo2, heartFor(vo2)), FTP, 190)?.faulty).toEqual([])
  })

  it('finds a watch locked on the cadence through the warm-up, and estimates what the heart did', () => {
    const truth = heartFor(THRESHOLD_RIDE)
    const random = noise(9)
    const locked = truth.map((beat, second) => (second >= 120 && second < 840 ? 168 + random() * 2 : beat))
    const check = checkHeart(ride(THRESHOLD_RIDE, locked), FTP, 190)!

    expect(check.direction).toBe('high')
    expect(check.canEstimate).toBe(true)
    expect(check.faulty).toHaveLength(1)
    expect(check.faulty[0]!.from * check.step).toBeGreaterThanOrEqual(100)
    expect(check.faulty[0]!.to * check.step).toBeLessThanOrEqual(860)
    expect(Math.abs(mean(checkedBetween(check, 200, 800)) - mean(truth.slice(200, 800)))).toBeLessThan(5)
    expect(Math.abs(check.correctedAverage! - mean(truth))).toBeLessThan(2)
    expect(check.measuredAverage! - mean(truth)).toBeGreaterThan(4)
  })

  it('finds a strap that lost contact in an interval, and fills the hole', () => {
    const truth = heartFor(THRESHOLD_RIDE)
    const lost = truth.map((beat, second) => (second >= 2000 && second < 2400 ? null : beat))
    const check = checkHeart(ride(THRESHOLD_RIDE, lost), FTP, 190)!
    expect(check.direction).toBe('missing')
    expect(Math.abs(mean(checkedBetween(check, 2050, 2350)) - mean(truth.slice(2050, 2350)))).toBeLessThan(5)
  })

  it('finds a loose watch reading far too low under load', () => {
    const truth = heartFor(THRESHOLD_RIDE)
    const loose = truth.map((beat, second) => (second >= 1700 && second < 2400 ? beat - 30 : beat))
    const check = checkHeart(ride(THRESHOLD_RIDE, loose), FTP, 190)!
    expect(check.direction).toBe('low')
    expect(Math.abs(mean(checkedBetween(check, 1750, 2350)) - mean(truth.slice(1750, 2350)))).toBeLessThan(5)
  })

  it('estimates nothing from a recording that ignored the work for most of the session', () => {
    const random = noise(4)
    const stuck = heartFor(THRESHOLD_RIDE).map((beat, second) => (second >= 300 && second < 3800 ? 172 + random() * 3 : beat))
    const check = checkHeart(ride(THRESHOLD_RIDE, stuck), FTP, 190)!
    expect(check.direction).toBe('flat')
    expect(check.canEstimate).toBe(false)
    expect(check.heart.every((beat) => beat === null)).toBe(true)
  })

  it('does not take a sensor spike for a failed recording', () => {
    const spiky = heartFor(THRESHOLD_RIDE).map((beat, second) => (second % 400 < 8 ? 215 : beat))
    expect(checkHeart(ride(THRESHOLD_RIDE, spiky), FTP, 190)?.faulty).toEqual([])
  })

  it('reads a hilly run by its climbs, not by its pace alone', () => {
    // Even effort over rolling hills: slower uphill, faster down, the heart steady.
    const random = noise(5)
    const effort = effortOf([
      [900, 72],
      [2400, 75],
      [600, 68],
    ])
    let along = 0
    const speed: number[] = []
    const altitude: number[] = []
    const distance: number[] = []
    effort.forEach((percent) => {
      const grade = Math.max(-0.3, Math.min(0.3, 0.16 * Math.cos(along / 250)))
      const cost = (155.4 * grade ** 5 - 30.4 * grade ** 4 - 43.3 * grade ** 3 + 46.3 * grade ** 2 + 19.5 * grade + 3.6) / 3.6
      const metres = Math.max(0.5, ((percent / 100) * (1000 / 240)) / cost + random() * 0.15)
      along += metres
      speed.push(metres)
      altitude.push(40 * Math.sin(along / 250))
      distance.push(along)
    })
    const run: ActivityStreams = {
      time: effort.map((_, second) => second),
      watts: null,
      speed,
      heartRate: heartFor(effort),
      altitude,
      distance,
    }
    expect(checkHeart(run, PACE, 190)?.faulty).toEqual([])
  })

  it('has nothing to check without a heart rate, without the work, or in the pool', () => {
    expect(checkHeart(ride(THRESHOLD_RIDE, THRESHOLD_RIDE.map(() => null)), FTP)).toBeNull()
    expect(checkHeart({ ...ride(THRESHOLD_RIDE, heartFor(THRESHOLD_RIDE)), watts: null }, FTP)).toBeNull()
    expect(checkHeart(ride(THRESHOLD_RIDE, heartFor(THRESHOLD_RIDE)), { metric: 'swimPace', cssSecPer100m: 100 })).toBeNull()
  })
})

describe('the checked heart rate on the card', () => {
  const step = (index: number, from: number, heartRate: number): ExecutedStep => ({
    index,
    plannedSeconds: 720,
    low: 95,
    high: 105,
    actualSeconds: 720,
    actualPercent: 102,
    actualValue: '255 W',
    verdict: 'on',
    cutShort: false,
    pieces: 1,
    span: { from, to: from + 720 },
    heartRate,
  })
  const executionOf = (streams: ActivityStreams): Execution => ({
    activityId: 'i1',
    templateName: 'Schwelle 3×12',
    sport: 'Ride',
    metric: 'power',
    steps: [step(1, 900, 160), step(2, 1920, 140), step(3, 2940, 168)],
    segments: [],
    workPlannedSeconds: 2160,
    workDoneSeconds: 2160,
    inTargetSeconds: 2160,
    duration: { planned: 4260, actual: 4260 },
    load: { planned: 80, actual: 82 },
    compliance: null,
    unavailable: null,
    trace: buildTrace(streams, FTP),
  })

  it('replaces the faulty interval, marks it estimated and names it under the session', () => {
    const truth = heartFor(THRESHOLD_RIDE)
    const loose = truth.map((beat, second) => (second >= 1900 && second < 2700 ? beat - 30 : beat))
    const streams = ride(THRESHOLD_RIDE, loose)
    const checked = withHeartCheck(executionOf(streams), checkHeart(streams, FTP, 190))

    expect(checked.steps[0]).toEqual(step(1, 900, 160))
    expect(checked.steps[1]?.heartEstimated).toBe(true)
    expect(Math.abs(checked.steps[1]!.heartRate! - mean(truth.slice(1920, 2640)))).toBeLessThan(5)
    expect(checked.trace?.points.some((point) => point.heartEstimated)).toBe(true)
    expect(checked.trace?.points.filter((point) => point.heartEstimated).every((point) => point.seconds >= 1850 && point.seconds < 2750)).toBe(true)
    expect(checked.heart?.estimated).toBe(true)
    expect(checked.heart?.message).toMatch(/^Pulsaufzeichnung gestört: \d+ von 71 min zu niedrig für die Leistung/)
    expect(checked.heart?.message).toContain('Geschätzt aus')
    expect(checked.heart?.message).toContain('mit ~ markiert')
  })

  it('says so under the session, with the estimate dashed and marked', () => {
    const loose = heartFor(THRESHOLD_RIDE).map((beat, second) => (second >= 1900 && second < 2700 ? beat - 30 : beat))
    const streams = ride(THRESHOLD_RIDE, loose)
    const html = renderToStaticMarkup(
      createElement(ExecutionView, { execution: withHeartCheck(executionOf(streams), checkHeart(streams, FTP, 190)) }),
    )
    expect(html).toContain('Pulsaufzeichnung gestört')
    expect(html).toContain('♥~')
    expect(html).toContain('trace__pulse--estimated')
    expect(html).toContain('Puls geschätzt')

    const clean = ride(THRESHOLD_RIDE, heartFor(THRESHOLD_RIDE))
    const plain = renderToStaticMarkup(createElement(ExecutionView, { execution: executionOf(clean) }))
    expect(plain).not.toContain('Pulsaufzeichnung')
    expect(plain).not.toContain('geschätzt')
  })

  it('hides what it cannot estimate rather than showing it', () => {
    const random = noise(4)
    const stuck = heartFor(THRESHOLD_RIDE).map((beat, second) => (second >= 300 && second < 3800 ? 172 + random() * 3 : beat))
    const streams = ride(THRESHOLD_RIDE, stuck)
    const checked = withHeartCheck(executionOf(streams), checkHeart(streams, FTP, 190))
    expect(checked.steps.every((entry) => entry.heartRate === null && !entry.heartEstimated)).toBe(true)
    expect(checked.trace?.points.every((point) => point.heartRate === null)).toBe(true)
    expect(checked.heart?.estimated).toBe(false)
    expect(checked.heart?.message).toContain('ausgeblendet')
  })

  it('changes nothing about a clean session', () => {
    const streams = ride(THRESHOLD_RIDE, heartFor(THRESHOLD_RIDE))
    const execution = executionOf(streams)
    expect(withHeartCheck(execution, checkHeart(streams, FTP, 190))).toBe(execution)
    expect(withHeartCheck(execution, null)).toBe(execution)
  })
})

describe('the heart rate as written back', () => {
  it('replaces only the faulty samples, one for one', () => {
    const truth = heartFor(THRESHOLD_RIDE)
    const lost = truth.map((beat, second) => (second >= 2000 && second < 2400 ? null : beat))
    const streams = ride(THRESHOLD_RIDE, lost)
    const written = correctedHeartRate(streams, checkHeart(streams, FTP, 190))!
    expect(written).toHaveLength(lost.length)
    expect(written.slice(0, 1900)).toEqual(lost.slice(0, 1900))
    expect(written.slice(2050, 2350).every((beat) => beat !== null && Number.isInteger(beat))).toBe(true)
    expect(Math.abs(mean(written.slice(2050, 2350)) - mean(truth.slice(2050, 2350)))).toBeLessThan(5)
  })

  it('writes nothing over a clean recording, nor over one too broken to estimate', () => {
    const clean = ride(THRESHOLD_RIDE, heartFor(THRESHOLD_RIDE))
    expect(correctedHeartRate(clean, checkHeart(clean, FTP, 190))).toBeNull()
    const random = noise(4)
    const stuck = ride(
      THRESHOLD_RIDE,
      heartFor(THRESHOLD_RIDE).map((beat, second) => (second >= 300 && second < 3800 ? 172 + random() * 3 : beat)),
    )
    expect(correctedHeartRate(stuck, checkHeart(stuck, FTP, 190))).toBeNull()
  })

  it('is offered on the card only where it may be written', () => {
    const note = {
      faultySeconds: 720,
      recordedSeconds: 4260,
      spans: [{ from: 120, to: 840 }],
      estimated: true,
      measuredAverage: 168,
      correctedAverage: 165,
      message: 'Pulsaufzeichnung gestört',
    }
    const offered = (writable: boolean) =>
      renderToStaticMarkup(
        createElement(HeartCorrection, {
          heart: { ...note, writable },
          activityId: 'i1',
          templateId: 'bike-thr-3x12',
          date: '2026-10-06',
        }),
      )
    expect(offered(true)).toContain('In intervals.icu korrigieren')
    expect(offered(false)).toBe('')
  })
})
