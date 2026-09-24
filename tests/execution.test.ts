import { describe, expect, it } from 'vitest'
import { compareExecution, pairIntervals, plannedBlocks } from '../src/coach/execution.ts'
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
})
const easy = (seconds: number): ActualInterval => ({
  kind: 'recovery',
  seconds,
  averageWatts: 150,
  averageSpeedMps: null,
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
    const fast: ActualInterval = { kind: 'work', seconds: 230, averageWatts: null, averageSpeedMps: 1000 / 230 }
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
    })
    const withSurge = [at(236, 236), at(233, 233), at(240, 240), at(90, 225), at(238, 238), at(246, 246)]
    const result = compare(withSurge, run, pace)

    expect(result.steps.map((step) => step.actualSeconds)).toEqual([236, 233, 240, 238, 246])
    expect(result.steps.every((step) => !step.cutShort)).toBe(true)
    expect(result.mismatch).toEqual({ planned: 5, detected: 6 })
  })

  it('pairs in order and by duration, and misses the last interval of a session stopped early', () => {
    expect(pairIntervals([720, 720, 720], [720, 720])).toEqual([0, 1, -1])
    expect(pairIntervals([240, 240, 240], [240, 60, 240, 240])).toEqual([0, 2, 3])
    expect(pairIntervals([240, 240], [240, 240])).toEqual([0, 1])
    expect(pairIntervals([300], [])).toEqual([-1])
  })

  it('compares against the shortened version when that is what was pushed', () => {
    const full = plannedBlocks(threshold3x12, FTP, null)
    const short = plannedBlocks(threshold3x12, FTP, 45)
    expect(totalSeconds(short, FTP)).toBeLessThan(totalSeconds(full, FTP))
    expect(plannedBlocks(threshold3x12, FTP, threshold3x12.minutes)).toBe(threshold3x12.blocks)
  })
})
