import type { Execution, SportThreshold } from './types.ts'

/**
 * What the work intervals of one session say, apart from the rest of it. An
 * average over the whole activity mixes in warm-up, jogs and cool-down: a longer
 * warm-up lowers the heart rate and reads as progress that never happened.
 */
export type WorkReading = {
  /** Share of threshold held over the work, time-weighted. */
  readonly percent: number
  /** Middle of the target bands, time-weighted, for the same intervals. */
  readonly targetPercent: number
  /** Heart rate over the work, time-weighted; null without a strap or watch reading. */
  readonly heartRate: number | null
  /**
   * How far outside the target the work sat, in points of threshold, time-weighted:
   * above the band counts from its top, below from its bottom, inside is zero.
   */
  readonly deviation: number
  readonly seconds: number
}

const weighted = (pairs: readonly (readonly [number, number])[]): number | null => {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0)
  return total > 0 ? pairs.reduce((sum, [value, weight]) => sum + value * weight, 0) / total : null
}

export const workReading = (execution: Execution): WorkReading | null => {
  if (execution.unavailable !== null) return null
  const done = execution.steps.flatMap((step) =>
    step.actualPercent !== null && step.actualSeconds !== null && step.actualSeconds > 0
      ? [{ ...step, actualPercent: step.actualPercent, actualSeconds: step.actualSeconds }]
      : [],
  )
  if (done.length === 0) return null
  const percent = weighted(done.map((step) => [step.actualPercent, step.actualSeconds] as const))
  const targetPercent = weighted(done.map((step) => [(step.low + step.high) / 2, step.actualSeconds] as const))
  const deviation = weighted(
    done.map((step) => {
      const off =
        step.actualPercent > step.high
          ? step.actualPercent - step.high
          : step.actualPercent < step.low
            ? step.actualPercent - step.low
            : 0
      return [off, step.actualSeconds] as const
    }),
  )
  // Heart rate only where every interval has one: a gap would weigh the rest wrongly.
  const heartRate = done.every((step) => step.heartRate !== null)
    ? weighted(done.map((step) => [step.heartRate!, step.actualSeconds] as const))
    : null
  if (percent === null || targetPercent === null || deviation === null) return null
  return {
    percent,
    targetPercent,
    heartRate,
    deviation,
    seconds: done.reduce((sum, step) => sum + step.actualSeconds, 0),
  }
}

/**
 * Work per heartbeat. Two readings are comparable because both percentages are
 * taken against the same current threshold when they are read, so the ratio
 * follows the absolute pace or power, whatever the threshold was on the day.
 */
export const efficiencyOf = (reading: WorkReading): number | null =>
  reading.heartRate !== null && reading.heartRate > 0 ? reading.percent / reading.heartRate : null

/** Change in efficiency from one reading to the next, in percent; positive is better. */
export const efficiencyChange = (latest: WorkReading, previous: WorkReading): number | null => {
  const now = efficiencyOf(latest)
  const before = efficiencyOf(previous)
  return now === null || before === null ? null : (now / before - 1) * 100
}

/**
 * The threshold at which the work would have sat in the middle of its bands.
 * Percent is threshold over pace for running and swimming, watts over FTP for the
 * bike, so a faster pace means a smaller number of seconds and a larger FTP.
 */
export const thresholdImplied = (metric: SportThreshold['metric'], configured: number, readings: readonly WorkReading[]): number | null => {
  const factor = weighted(readings.map((reading) => [reading.percent / reading.targetPercent, reading.seconds] as const))
  if (factor === null || factor <= 0) return null
  return metric === 'power' ? configured * factor : configured / factor
}
