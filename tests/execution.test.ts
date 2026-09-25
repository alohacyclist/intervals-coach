import { describe, expect, it } from 'vitest'
import { alignIntervals, compareExecution, plannedBlocks } from '../src/coach/execution.ts'
import type { ActualInterval } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import { totalSeconds } from '../src/coach/variant.ts'
import type { SportThreshold, WorkoutTemplate } from '../src/coach/types.ts'

const FTP: SportThreshold = { metric: 'power', ftp: 280 }
const threshold3x12 = findTemplate('bike-thr-3x12') as WorkoutTemplate

const work = (seconds: number, watts: number | null): ActualInterval => ({
  kind: 'work',
  seconds,
  averageWatts: watts,
  averageSpeedMps: null,
  averageHeartrate: null,
  startSeconds: null,
  endSeconds: null,
})
const easy = (seconds: number): ActualInterval => ({
  kind: 'recovery',
  seconds,
  averageWatts: 150,
  averageSpeedMps: null,
  averageHeartrate: null,
  startSeconds: null,
  endSeconds: null,
})

const compare = (
  intervals: readonly ActualInterval[],
  template = threshold3x12,
  threshold: SportThreshold = FTP,
) =>
  compareExecution({
    activityId: 'a1',
    sport: template.sport,
    template,
    blocks: template.blocks,
    threshold,
    intervals,
    load: 74,
    movingSeconds: 3990,
    compliance: 78,
    trace: null,
  })

/** The session from the drafts: first too hot, second clean, third faded and stopped. */
const uneven = [
  easy(1080),
  work(720, 297),
  easy(300),
  work(720, 280),
  easy(300),
  work(510, 263),
]

describe('planned against done', () => {
  it('judges each interval against its own target band', () => {
    const result = compare(uneven)
    expect(result.steps.map((step) => step.verdict)).toEqual(['over', 'on', 'under'])
    expect(result.steps.map((step) => step.actualPercent)).toEqual([106, 100, 94])
    expect(result.steps.map((step) => step.actualValue)).toEqual(['297 W', '280 W', '263 W'])
    expect(result.steps[0]).toMatchObject({ low: 97, high: 102 })
  })

  it('calls an interval cut short when it fell well below its planned length', () => {
    expect(compare(uneven).steps.map((step) => step.cutShort)).toEqual([false, false, true])
  })

  it('adds up the time in target and the work done against the work planned', () => {
    const result = compare(uneven)
    expect(result.inTargetSeconds).toBe(720)
    expect(result.workDoneSeconds).toBe(720 + 720 + 510)
    expect(result.workPlannedSeconds).toBe(3 * 720)
    expect(result.load).toEqual({ planned: 88, actual: 74 })
    expect(result.compliance).toBe(78)
  })

  /** The reason the comparison runs by order: a clock would slide everything. */
  it('is not thrown by a warm-up longer than planned', () => {
    const longWarmUp = [easy(1500), ...uneven.slice(1)]
    expect(compare(longWarmUp).steps.map((step) => step.verdict)).toEqual(['over', 'on', 'under'])
  })

  it('ignores a surge too short to be an interval', () => {
    const withSurge = [easy(600), work(12, 450), ...uneven]
    const result = compare(withSurge)
    expect(result.steps.map((step) => step.verdict)).toEqual(['over', 'on', 'under'])
    expect(result.mismatch).toBeNull()
  })

  it('says so when detection and plan disagree, rather than guessing quietly', () => {
    const four = [...uneven, easy(300), work(400, 290)]
    const result = compare(four)
    expect(result.mismatch).toEqual({ planned: 3, detected: 4 })
    // Still paired by order — the mismatch is information, not a refusal.
    expect(result.steps.map((step) => step.verdict)).toEqual(['over', 'on', 'under'])
  })

  it('leaves an interval that was never ridden empty, and draws it as missing', () => {
    const two = uneven.slice(0, 4)
    const result = compare(two)
    expect(result.steps[2]).toMatchObject({ actualSeconds: null, verdict: null })
    expect(result.mismatch).toEqual({ planned: 3, detected: 2 })
    const work = result.segments.filter((segment) => segment.state !== 'rest')
    expect(work.map((segment) => segment.state)).toEqual(['off', 'on', 'missing'])
  })

  it('draws the done share of a cut-short interval, not the whole block', () => {
    const third = compare(uneven).segments.filter((segment) => segment.state !== 'rest')[2]
    expect(third?.done).toBeCloseTo(510 / 720, 5)
  })

  it('refuses to invent watts for a ride without a power meter', () => {
    const noPower = uneven.map((interval) => ({ ...interval, averageWatts: null }))
    const result = compare(noPower)
    expect(result.unavailable).toContain('Wattmessung')
    expect(result.steps.every((step) => step.verdict === null)).toBe(true)
    expect(result.mismatch).toBeNull()
    // Ridden, just not measured: nothing may be drawn as missed.
    expect(result.segments.every((segment) => segment.state === 'rest')).toBe(true)
  })

  it('compares the length, which is all a long session is about', () => {
    const long = findTemplate('bike-long-90') as WorkoutTemplate
    expect(compare([work(5400, 180)], long).duration).toEqual({ planned: 5400, actual: 3990 })
  })

  it('reads faster than threshold pace as above one hundred percent', () => {
    const run = findTemplate('run-thr-5x1k') as WorkoutTemplate
    const pace: SportThreshold = { metric: 'pace', thresholdSecPerKm: 240 }
    // 3:50 per km against a threshold of 4:00 per km.
    const fast: ActualInterval = { ...work(230, null), averageSpeedMps: 1000 / 230 }
    const result = compare(Array.from({ length: 5 }, () => fast), run, pace)
    expect(result.steps[0]?.actualPercent).toBe(104)
    expect(result.steps[0]?.actualValue).toBe('3:50 /km')
  })

  it('compares nothing block by block in a session whose point is its length', () => {
    const long = findTemplate('bike-long-90') as WorkoutTemplate
    const result = compare([work(5400, 180)], long)
    expect(result.steps).toEqual([])
    expect(result.segments.every((segment) => segment.state === 'rest')).toBe(true)
    expect(result.unavailable).toBeNull()
  })

  /**
   * The render caught this: paired by order alone, one surge between the third
   * and fourth kilometre took the fourth interval's place and shifted the fifth.
   */
  it('leaves out a surge in the middle instead of shifting every interval after it', () => {
    const run = findTemplate('run-thr-5x1k') as WorkoutTemplate
    const pace: SportThreshold = { metric: 'pace', thresholdSecPerKm: 240 }
    const at = (seconds: number, secPerKm: number): ActualInterval => ({
      kind: 'work',
      seconds,
      averageWatts: null,
      averageSpeedMps: 1000 / secPerKm,
      averageHeartrate: null,
      startSeconds: null,
      endSeconds: null,
    })
    const withSurge = [at(236, 236), at(233, 233), at(240, 240), at(90, 225), at(238, 238), at(246, 246)]
    const result = compare(withSurge, run, pace)

    expect(result.steps.map((step) => step.actualSeconds)).toEqual([236, 233, 240, 238, 246])
    expect(result.steps.every((step) => !step.cutShort)).toBe(true)
    expect(result.mismatch).toEqual({ planned: 5, detected: 6 })
  })

  it('pairs in order and by duration, and misses the last interval of a session stopped early', () => {
    const plan = (seconds: number) => ({ seconds, low: 97, high: 102 })
    const seen = (seconds: number, percent: number | null = null) => ({ seconds, percent, gapBefore: 300 })
    expect(alignIntervals([plan(720), plan(720), plan(720)], [seen(720), seen(720)])).toEqual([[0], [1], []])
    expect(alignIntervals([plan(240), plan(240), plan(240)], [seen(240), seen(60), seen(240), seen(240)])).toEqual([
      [0],
      [2],
      [3],
    ])
    expect(alignIntervals([plan(240), plan(240)], [seen(240), seen(240)])).toEqual([[0], [1]])
    expect(alignIntervals([plan(300)], [])).toEqual([[]])
  })

  it('never lets a jog pass for an interval, however well its length fits', () => {
    const plan = { seconds: 240, low: 104, high: 108 }
    // Four minutes of cool-down at 73 % against two pieces of a real interval.
    const cooldown = { seconds: 247, percent: 73, gapBefore: 0 }
    const halves = [
      { seconds: 140, percent: 107, gapBefore: 180 },
      { seconds: 95, percent: 106, gapBefore: 15 },
    ]
    expect(alignIntervals([plan], [...halves, cooldown])).toEqual([[0, 1]])
    // And on its own, the jog is not the interval either: it was not done.
    expect(alignIntervals([plan], [cooldown])).toEqual([[]])
  })

  it('does not join two intervals that had a real recovery between them', () => {
    const plan = { seconds: 240, low: 104, high: 108 }
    const apart = [
      { seconds: 120, percent: 106, gapBefore: 300 },
      { seconds: 120, percent: 106, gapBefore: 180 },
    ]
    expect(alignIntervals([plan], apart).flat().length).toBe(1)
  })

  /**
   * The first real comparison, rebuilt from the Strava splits: four by four
   * minutes, the fourth interrupted by a pressed stop button, and a cool-down
   * that intervals.icu happened to file as work. By duration alone the fourth
   * interval was paired with the cool-down and read as 73 %, "zu leicht".
   */
  describe('the Formkontrolle run with a stop in the last interval', () => {
    const benchmark = findTemplate('bench-run-4x4') as WorkoutTemplate
    const pace: SportThreshold = { metric: 'pace', thresholdSecPerKm: 240 }
    const at = (seconds: number, secPerKm: number, kind: 'work' | 'recovery' = 'work'): ActualInterval => ({
      kind,
      seconds,
      averageWatts: null,
      averageSpeedMps: 1000 / secPerKm,
      averageHeartrate: null,
      startSeconds: null,
      endSeconds: null,
    })
    const session = [
      at(400, 300, 'recovery'),
      at(25, 250),
      at(60, 300, 'recovery'),
      at(25, 245),
      at(60, 300, 'recovery'),
      at(224, 225),
      at(180, 330, 'recovery'),
      at(224, 228),
      at(180, 330, 'recovery'),
      at(230, 230),
      at(180, 330, 'recovery'),
      at(140, 224),
      at(12, 400, 'recovery'),
      at(95, 227),
      at(60, 320, 'recovery'),
      at(247, 328),
    ]
    const run = (intervals: readonly ActualInterval[]) => compare(intervals, benchmark, pace)

    it('still says that detection found more than was planned', () => {
      expect(run(session).mismatch).toEqual({ planned: 4, detected: 8 })
    })

    it('says nothing when the only difference was a split interval joined back', () => {
      const clean = session.filter((interval) => interval.seconds !== 25 && interval.seconds !== 247)
      expect(run(clean).mismatch).toBeNull()
    })

    it('reads the fourth interval as the two pieces it was run in', () => {
      const fourth = run(session).steps[3]
      expect(fourth).toMatchObject({ verdict: 'on', pieces: 2, cutShort: false, actualSeconds: 235 })
    })

    it('leaves the cool-down out of every interval', () => {
      expect(run(session).steps.every((step) => step.actualValue !== '5:28 /km')).toBe(true)
      expect(run(session).steps.map((step) => step.verdict)).toEqual(['on', 'on', 'on', 'on'])
    })

    it('calls the fourth not done if it really was not, instead of borrowing the cool-down', () => {
      const withoutFourth = session.filter((interval) => ![140, 95].includes(interval.seconds))
      expect(run(withoutFourth).steps[3]).toMatchObject({ verdict: null, actualSeconds: null })
    })
  })

  it('declines to judge forty-second intervals that came back as one block per set', () => {
    const micro = findTemplate('bike-vo2-3040') as WorkoutTemplate
    const result = compare([work(360, 330), easy(240), work(360, 328), easy(240), work(360, 325)], micro)
    expect(result.unavailable).toContain('Blöcken')
    expect(result.segments.every((segment) => segment.state === 'rest')).toBe(true)
  })

  it('compares against the shortened version when that is what was pushed', () => {
    const full = plannedBlocks(threshold3x12, FTP, null)
    const short = plannedBlocks(threshold3x12, FTP, 45)
    expect(totalSeconds(short, FTP)).toBeLessThan(totalSeconds(full, FTP))
    expect(plannedBlocks(threshold3x12, FTP, threshold3x12.minutes)).toBe(threshold3x12.blocks)
  })
})

describe('where each interval lay in the activity', () => {
  const placed = (from: number, to: number, watts: number, heart: number): ActualInterval => ({
    ...work(to - from, watts),
    averageHeartrate: heart,
    startSeconds: from,
    endSeconds: to,
  })
  const gap = (from: number, to: number): ActualInterval => ({ ...easy(to - from), startSeconds: from, endSeconds: to })

  it('carries the span and the heart rate of each paired interval', () => {
    const result = compare([
      gap(0, 900),
      placed(900, 1620, 290, 158),
      gap(1620, 1920),
      placed(1920, 2640, 285, 163),
      gap(2640, 2940),
      placed(2940, 3660, 280, 167),
    ])
    expect(result.steps.map((step) => step.span)).toEqual([
      { from: 900, to: 1620 },
      { from: 1920, to: 2640 },
      { from: 2940, to: 3660 },
    ])
    expect(result.steps.map((step) => step.heartRate)).toEqual([158, 163, 167])
  })

  it('spans an interrupted interval from its first piece to its last, the pause included', () => {
    const result = compare([
      gap(0, 900),
      placed(900, 1620, 290, 158),
      gap(1620, 1920),
      placed(1920, 2640, 285, 163),
      gap(2640, 2940),
      placed(2940, 3400, 280, 160),
      gap(3400, 3440),
      placed(3440, 3700, 280, 170),
    ])
    const third = result.steps[2]
    expect(third).toMatchObject({ pieces: 2, span: { from: 2940, to: 3700 } })
    // Time-weighted: 460 s at 160 and 260 s at 170.
    expect(third?.heartRate).toBe(164)
  })

  it('knows no span for an interval that was not done or not placed', () => {
    const result = compare([work(720, 290)])
    expect(result.steps.every((step) => step.span === null && step.heartRate === null)).toBe(true)
  })
})
