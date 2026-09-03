import type { Activity, Fitness, Sport, Stimulus } from './types.ts'
import { addDays, diffDays } from './dates.ts'

export const CTL_DAYS = 42
export const ATL_DAYS = 7

const emptyFitness: Fitness = { ctl: 0, atl: 0, tsb: 0 }

/** Sums daily training load, restricted to `sport` when given. */
export const dailyLoads = (
  activities: readonly Activity[],
  from: string,
  to: string,
  sport?: Sport,
): readonly number[] => {
  const days = diffDays(from, to)
  if (days < 0) return []
  const buckets = new Array<number>(days + 1).fill(0)
  for (const activity of activities) {
    if (sport && activity.sport !== sport) continue
    const index = diffDays(from, activity.date)
    if (index < 0 || index >= buckets.length) continue
    buckets[index] = (buckets[index] ?? 0) + activity.load
  }
  return buckets
}

/** Exponentially weighted moving average, seeded at 0 — the standard CTL/ATL model. */
export const ewmaSeries = (loads: readonly number[], timeConstant: number): readonly number[] => {
  const alpha = 1 / timeConstant
  return loads.reduce<number[]>((series, load) => {
    const previous = series.length === 0 ? 0 : (series[series.length - 1] ?? 0)
    return [...series, previous + (load - previous) * alpha]
  }, [])
}

const last = (series: readonly number[]): number => series[series.length - 1] ?? 0

const nthFromEnd = (series: readonly number[], offset: number): number =>
  series[series.length - 1 - offset] ?? 0

export const computeFitness = (
  activities: readonly Activity[],
  today: string,
  sport?: Sport,
  historyDays = 180,
): Fitness => {
  const from = addDays(today, -historyDays)
  const loads = dailyLoads(activities, from, today, sport)
  if (loads.length === 0) return emptyFitness
  const ctlSeries = ewmaSeries(loads, CTL_DAYS)
  const atlSeries = ewmaSeries(loads, ATL_DAYS)
  return {
    ctl: round(last(ctlSeries)),
    atl: round(last(atlSeries)),
    // Form is yesterday's balance, matching the intervals.icu convention.
    tsb: round(nthFromEnd(ctlSeries, 1) - nthFromEnd(atlSeries, 1)),
  }
}

/** CTL gained over the last 7 days — the ramp rate guardrail. */
export const rampRate = (activities: readonly Activity[], today: string, historyDays = 180): number => {
  const from = addDays(today, -historyDays)
  const ctlSeries = ewmaSeries(dailyLoads(activities, from, today), CTL_DAYS)
  return round(last(ctlSeries) - nthFromEnd(ctlSeries, 7))
}

/** Applies one extra day of load to an existing fitness snapshot. */
export const projectFitness = (fitness: Fitness, load: number): Fitness => {
  const ctl = fitness.ctl + (load - fitness.ctl) / CTL_DAYS
  const atl = fitness.atl + (load - fitness.atl) / ATL_DAYS
  return { ctl: round(ctl), atl: round(atl), tsb: round(fitness.ctl - fitness.atl) }
}

/**
 * Infers the training stimulus of a completed activity. intervals.icu does not
 * store the intent, so intensity factor and duration have to stand in for it.
 */
export const inferStimulus = (activity: Activity): Stimulus => {
  const { intensity, movingTimeSec } = activity
  if (intensity >= 100) return 'VO2'
  if (intensity >= 92) return 'THRESHOLD'
  if (intensity >= 84) return 'SWEETSPOT'
  if (intensity >= 76) return 'TEMPO'
  if (movingTimeSec >= 5400) return 'LONG'
  if (intensity > 0 && intensity < 62) return 'RECOVERY'
  return 'ENDURANCE'
}

export const HARD_STIMULI: readonly Stimulus[] = ['VO2', 'THRESHOLD', 'SWEETSPOT']

/**
 * A quality session needs time in the zone, not just a high intensity factor.
 * Below this load the session was too short to have cost a recovery slot — the
 * shortest workout this app proposes as hard carries 48.
 */
const MIN_QUALITY_LOAD = 40

/**
 * Whether an activity used up one of the week's hard slots. Intensity alone is
 * not enough: a 25 minute run at 86% is a brisk run, not a key session.
 */
export const isHardActivity = (activity: Activity): boolean =>
  activity.load >= 90 ||
  (HARD_STIMULI.includes(inferStimulus(activity)) && activity.load >= MIN_QUALITY_LOAD)

const round = (value: number): number => Math.round(value * 10) / 10
