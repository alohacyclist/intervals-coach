import type { Sport, SportThreshold } from './types.ts'

/**
 * Turning a maximal block into a threshold.
 *
 * The app prescribes the test, so it knows which effort was the test and can
 * read the number off it. Waiting instead for intervals.icu's own estimate to
 * move means waiting on a model that is bounded by everything else the athlete
 * has done — which is the very problem the test exists to escape.
 */

/** Below this the effort is an interval, not a sustained maximal block. */
const MIN_TEST_SECONDS = 15 * 60
/** Beyond this the factors below stop describing the effort that was made. */
const MAX_TEST_SECONDS = 25 * 60

/** Twenty minutes all out sits above an hour's power by about this much. */
const POWER_FACTOR = 0.95
/** Running is the same idea in reverse: threshold pace is slower than test pace. */
const PACE_FACTOR = 1.05

export type MeasuredEffort = {
  readonly seconds: number
  readonly averageWatts: number | null
  readonly averageSpeedMps: number | null
}

/**
 * The best sustained stretch of the test.
 *
 * intervals.icu detects intervals from the recorded data, not from the workout
 * that was prescribed: a twenty minute block comes back split into five four
 * minute pieces, and the recoveries around it are typed as work like everything
 * else. So the block is found rather than looked up — the neighbouring stretch
 * of at least fifteen minutes whose time weighted average is the strongest.
 */
const bestSustained = (
  efforts: readonly MeasuredEffort[],
  valueOf: (effort: MeasuredEffort) => number | null,
): number | null => {
  const usable = efforts.map((effort) => ({ seconds: effort.seconds, value: valueOf(effort) }))

  return usable.reduce<number | null>((best, _unused, start) => {
    const window = usable.slice(start).reduce<{ seconds: number; sum: number; best: number | null }>(
      (running, entry) => {
        // A stretch with nothing to measure ends the window rather than skewing it.
        if (entry.value === null || running.seconds >= MAX_TEST_SECONDS) return running
        const seconds = running.seconds + entry.seconds
        const sum = running.sum + entry.value * entry.seconds
        const average = sum / seconds
        const reached = seconds >= MIN_TEST_SECONDS && seconds <= MAX_TEST_SECONDS
        return {
          seconds,
          sum,
          best: reached && (running.best === null || average > running.best) ? average : running.best,
        }
      },
      { seconds: 0, sum: 0, best: null },
    ).best
    if (window === null) return best
    return best === null || window > best ? window : best
  }, null)
}

/**
 * The threshold this test measured, in the sport's own unit — null when the
 * activity holds no sustained block, which means the test was not completed as
 * prescribed and nothing should be read into it.
 */
export const thresholdFromTest = (
  sport: Sport,
  efforts: readonly MeasuredEffort[],
): { readonly metric: SportThreshold['metric']; readonly value: number } | null => {
  if (sport === 'Ride') {
    const watts = bestSustained(efforts, (effort) =>
      effort.averageWatts !== null && effort.averageWatts > 0 ? effort.averageWatts : null,
    )
    return watts === null ? null : { metric: 'power', value: Math.round(watts * POWER_FACTOR) }
  }

  // Speed rather than pace, so that faster is larger and the best window is a maximum.
  const speed = bestSustained(efforts, (effort) =>
    effort.averageSpeedMps !== null && effort.averageSpeedMps > 0 ? effort.averageSpeedMps : null,
  )
  if (speed === null) return null
  const secPerKm = (1000 / speed) * PACE_FACTOR
  return sport === 'Run'
    ? { metric: 'pace', value: Math.round(secPerKm) }
    : { metric: 'swimPace', value: Math.round(secPerKm / 10) }
}
