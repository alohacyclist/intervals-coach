/**
 * Two explainable rules on heart rate per watt (HR/W) of steady riding.
 *
 * Both only look at the steady block of a ride: the longest stretch after the warm-up in
 * which power per minute stays within a narrow spread. Interval sessions have no such block
 * and get no verdict, because HR/W swings with the effort there, not with the body.
 *
 * - `hrDrift`: HR/W of the second half of the block is above the first half (aerobic
 *   decoupling). Bands: up to 5 % none, 5 to 10 % moderate, above 10 % high.
 * - `elevatedHr`: HR/W of the first half of the block is above the mean of the rider's own
 *   steady blocks of the 42 days before, same environment, power within ±5 %.
 *
 * The 5 % line is a convention from coaching practice, not a tested cut-off. Warm-up,
 * spread and minimum length are own estimates. See docs/adr/0001-dashboard.md.
 */

export type DriftSeverity = 'moderate' | 'high'
export type SteadyRule = 'hrDrift' | 'elevatedHr'

export type SteadyThresholds = {
  readonly warmupS: number
  readonly minDurationS: number
  readonly powerSpread: number
  readonly hrDrift: number
  readonly hrDriftHigh: number
  readonly elevatedHr: number
  readonly comparablePowerBand: number
  readonly baselineDays: number
  readonly baselineMinRides: number
}

export const STEADY_THRESHOLDS: SteadyThresholds = {
  warmupS: 600,
  minDurationS: 1800,
  powerSpread: 0.2,
  hrDrift: 0.05,
  hrDriftHigh: 0.1,
  elevatedHr: 0.06,
  comparablePowerBand: 0.05,
  baselineDays: 42,
  baselineMinRides: 3,
}

/** Averages of the samples of one minute that carry both power and heart rate. */
export type MinuteBucket = {
  readonly minute: number
  readonly samples: number
  readonly watts: number
  readonly heartRate: number
}

export type SteadyBlock = {
  readonly startS: number
  readonly durationS: number
  readonly avgWatts: number
  readonly avgHeartRate: number
  readonly firstHalfHrPerW: number
  readonly secondHalfHrPerW: number
}

export type RideMetrics = {
  readonly activityId: string
  /** ISO start time; only compared, never shown by this module. */
  readonly start: string
  readonly indoor: boolean
  /** null: no steady block of the minimum length, so the rules give no verdict. */
  readonly block: SteadyBlock | null
}

export type SteadyFinding = {
  readonly activityId: string
  readonly start: string
  readonly rule: SteadyRule
  /** Only drift has bands. */
  readonly severity: DriftSeverity | null
  readonly indoor: boolean
  readonly block: SteadyBlock
  readonly observedHrPerW: number
  readonly referenceHrPerW: number
  readonly deviation: number
  readonly threshold: number
  readonly referenceRides: number | null
}

/**
 * Per-minute buckets from intervals.icu streams. `time` holds seconds since the start;
 * samples without power or heart rate are left out, as is a minute without any.
 */
export const minuteBuckets = (
  time: readonly (number | null)[],
  watts: readonly (number | null)[],
  heartRate: readonly (number | null)[],
): readonly MinuteBucket[] => {
  const sums = new Map<number, { samples: number; watts: number; heartRate: number }>()
  time.forEach((seconds, index) => {
    const w = watts[index]
    const h = heartRate[index]
    if (seconds == null || w == null || h == null || h <= 0) return
    const minute = Math.floor(seconds / 60)
    const sum = sums.get(minute) ?? { samples: 0, watts: 0, heartRate: 0 }
    sums.set(minute, { samples: sum.samples + 1, watts: sum.watts + w, heartRate: sum.heartRate + h })
  })
  return [...sums.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, s]) => ({
      minute,
      samples: s.samples,
      watts: s.watts / s.samples,
      heartRate: s.heartRate / s.samples,
    }))
}

const hrPerW = (minutes: readonly MinuteBucket[]): number => {
  const beats = minutes.reduce((sum, m) => sum + m.heartRate * m.samples, 0)
  const work = minutes.reduce((sum, m) => sum + m.watts * m.samples, 0)
  return beats / work
}

const weightedMean = (minutes: readonly MinuteBucket[], pick: (m: MinuteBucket) => number): number =>
  minutes.reduce((sum, m) => sum + pick(m) * m.samples, 0) /
  minutes.reduce((sum, m) => sum + m.samples, 0)

/**
 * [start, stop) of the longest run of consecutive minutes whose highest power is at most
 * `maxSpread` above the lowest. The check only gets stricter as a run grows, so each run
 * stops at its first violation. A missing minute (pause) or a minute at 0 W ends a run.
 */
export const longestSteadyRun = (
  minutes: readonly MinuteBucket[],
  maxSpread: number,
): readonly [number, number] => {
  let best: [number, number] = [0, 0]
  for (let i = 0; i < minutes.length; i++) {
    if (minutes.length - i <= best[1] - best[0]) break
    let low = minutes[i]?.watts ?? 0
    let high = low
    let j = i
    while (low > 0 && high <= low * (1 + maxSpread)) {
      j += 1
      const current = minutes[j]
      const previous = minutes[j - 1]
      if (!current || !previous || current.minute !== previous.minute + 1) break
      low = Math.min(low, current.watts)
      high = Math.max(high, current.watts)
    }
    if (j - i > best[1] - best[0]) best = [i, j]
  }
  return best
}

/** The longest steady stretch after the warm-up, or null if it is shorter than required. */
export const findSteadyBlock = (
  minutes: readonly MinuteBucket[],
  t: SteadyThresholds = STEADY_THRESHOLDS,
): SteadyBlock | null => {
  const afterWarmup = minutes.filter((m) => m.minute * 60 >= t.warmupS)
  const [start, stop] = longestSteadyRun(afterWarmup, t.powerSpread)
  const block = afterWarmup.slice(start, stop)
  const first = block[0]
  if (!first || block.length * 60 < t.minDurationS || block.length < 2) return null
  const half = Math.floor(block.length / 2)
  return {
    startS: first.minute * 60,
    durationS: block.length * 60,
    avgWatts: weightedMean(block, (m) => m.watts),
    avgHeartRate: weightedMean(block, (m) => m.heartRate),
    firstHalfHrPerW: hrPerW(block.slice(0, half)),
    // An odd block leaves its middle minute out of both halves.
    secondHalfHrPerW: hrPerW(block.slice(-half)),
  }
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits))

const finding = (
  ride: RideMetrics,
  block: SteadyBlock,
  rule: SteadyRule,
  observed: number,
  reference: number,
  threshold: number,
  extra: { severity?: DriftSeverity; referenceRides?: number } = {},
): SteadyFinding => ({
  activityId: ride.activityId,
  start: ride.start,
  rule,
  severity: extra.severity ?? null,
  indoor: ride.indoor,
  block,
  observedHrPerW: round(observed, 3),
  referenceHrPerW: round(reference, 3),
  deviation: round(observed / reference - 1, 3),
  threshold,
  referenceRides: extra.referenceRides ?? null,
})

export const detectHrDrift = (
  rides: readonly RideMetrics[],
  t: SteadyThresholds = STEADY_THRESHOLDS,
): readonly SteadyFinding[] =>
  rides.flatMap((ride) => {
    const block = ride.block
    if (!block) return []
    const drift = block.secondHalfHrPerW / block.firstHalfHrPerW - 1
    if (drift <= t.hrDrift) return []
    const severity: DriftSeverity = drift > t.hrDriftHigh ? 'high' : 'moderate'
    return [finding(ride, block, 'hrDrift', block.secondHalfHrPerW, block.firstHalfHrPerW, t.hrDrift, { severity })]
  })

const DAY_MS = 86_400_000

const comparableEarlier = (
  ride: RideMetrics,
  block: SteadyBlock,
  rides: readonly RideMetrics[],
  t: SteadyThresholds,
): readonly number[] => {
  const start = Date.parse(ride.start)
  const windowStart = start - t.baselineDays * DAY_MS
  const maxGap = t.comparablePowerBand * block.avgWatts
  return rides.flatMap((other) => {
    const otherStart = Date.parse(other.start)
    const ok =
      other.block !== null &&
      other.indoor === ride.indoor &&
      otherStart >= windowStart &&
      otherStart < start &&
      Math.abs(other.block.avgWatts - block.avgWatts) <= maxGap
    return ok && other.block ? [other.block.firstHalfHrPerW] : []
  })
}

export const detectElevatedHr = (
  rides: readonly RideMetrics[],
  t: SteadyThresholds = STEADY_THRESHOLDS,
): readonly SteadyFinding[] =>
  rides.flatMap((ride) => {
    const block = ride.block
    if (!block) return []
    const references = comparableEarlier(ride, block, rides, t)
    if (references.length < t.baselineMinRides) return []
    const baseline = references.reduce((sum, v) => sum + v, 0) / references.length
    if (block.firstHalfHrPerW / baseline - 1 <= t.elevatedHr) return []
    return [
      finding(ride, block, 'elevatedHr', block.firstHalfHrPerW, baseline, t.elevatedHr, {
        referenceRides: references.length,
      }),
    ]
  })

/** Findings for rides starting at `since` or later; earlier rides only serve as baseline. */
export const detectSteadyFindings = (
  rides: readonly RideMetrics[],
  since: string,
  t: SteadyThresholds = STEADY_THRESHOLDS,
): readonly SteadyFinding[] => {
  const from = Date.parse(since)
  return [...detectHrDrift(rides, t), ...detectElevatedHr(rides, t)]
    .filter((f) => Date.parse(f.start) >= from)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.rule.localeCompare(b.rule))
}
