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

/** Twenty minutes all out sits above an hour's power by about this much. */
const POWER_FACTOR = 0.95
/** Running is the same idea in reverse: threshold pace is slower than test pace. */
const PACE_FACTOR = 1.05

export type MeasuredEffort = {
  readonly seconds: number
  readonly averageWatts: number | null
  readonly averageSpeedMps: number | null
}

const longest = (efforts: readonly MeasuredEffort[]): MeasuredEffort | null =>
  efforts
    .filter((effort) => effort.seconds >= MIN_TEST_SECONDS)
    .reduce<MeasuredEffort | null>(
      (best, effort) => (best === null || effort.seconds > best.seconds ? effort : best),
      null,
    )

/**
 * The threshold this test measured, in the sport's own unit — null when the
 * activity holds no sustained block, which means the test was not completed as
 * prescribed and nothing should be read into it.
 */
export const thresholdFromTest = (
  sport: Sport,
  efforts: readonly MeasuredEffort[],
): { readonly metric: SportThreshold['metric']; readonly value: number } | null => {
  const block = longest(efforts)
  if (!block) return null

  if (sport === 'Ride') {
    return block.averageWatts === null || block.averageWatts <= 0
      ? null
      : { metric: 'power', value: Math.round(block.averageWatts * POWER_FACTOR) }
  }

  if (block.averageSpeedMps === null || block.averageSpeedMps <= 0) return null
  const secPerKm = 1000 / block.averageSpeedMps
  return sport === 'Run'
    ? { metric: 'pace', value: Math.round(secPerKm * PACE_FACTOR) }
    : { metric: 'swimPace', value: Math.round((secPerKm / 10) * PACE_FACTOR) }
}
