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

const MINUTE = 60

const secondsIn = (activity: Activity, ...zones: readonly string[]): number =>
  zones.reduce((sum, zone) => sum + (activity.zoneSeconds[zone] ?? 0), 0)

/**
 * Classifies a session by time spent in each zone rather than by its average
 * intensity. An interval session never averages its own stimulus — warm-up,
 * recoveries and cool-down drag it down, so a threshold workout reads as
 * sweetspot and a VO2max workout reads as threshold. Time in zone also survives
 * a mis-set FTP far better, because zones are wide.
 */
const fromZones = (activity: Activity): Stimulus | null => {
  if (Object.keys(activity.zoneSeconds).length === 0) return null
  const vo2 = secondsIn(activity, 'Z5', 'Z6', 'Z7')
  const threshold = secondsIn(activity, 'Z4')
  const sweetSpot = secondsIn(activity, 'SS')
  const tempo = secondsIn(activity, 'Z3')

  if (vo2 >= 6 * MINUTE) return 'VO2'
  if (threshold >= 10 * MINUTE) return 'THRESHOLD'
  if (sweetSpot >= 15 * MINUTE) return 'SWEETSPOT'
  if (tempo >= 15 * MINUTE) return 'TEMPO'
  if (activity.movingTimeSec >= 5400) return 'LONG'
  return secondsIn(activity, 'Z1') > activity.movingTimeSec * 0.8 ? 'RECOVERY' : 'ENDURANCE'
}

/** Fallback for activities that arrive without zone data. */
const fromIntensity = (activity: Activity): Stimulus => {
  const { intensity, movingTimeSec } = activity
  if (intensity >= 100) return 'VO2'
  if (intensity >= 92) return 'THRESHOLD'
  if (intensity >= 84) return 'SWEETSPOT'
  if (intensity >= 76) return 'TEMPO'
  if (movingTimeSec >= 5400) return 'LONG'
  if (intensity > 0 && intensity < 62) return 'RECOVERY'
  return 'ENDURANCE'
}

export const inferStimulus = (activity: Activity): Stimulus =>
  fromZones(activity) ?? fromIntensity(activity)

export const HARD_STIMULI: readonly Stimulus[] = ['VO2', 'THRESHOLD', 'SWEETSPOT']

/**
 * A quality session needs time in the zone, not just a high intensity factor.
 * Below this load the session was too short to have cost a recovery slot — the
 * shortest workout this app proposes as hard carries 48.
 */
const MIN_QUALITY_LOAD = 40

const hasZones = (activity: Activity): boolean => Object.keys(activity.zoneSeconds).length > 0

/**
 * Whether an activity used up one of the week's hard slots.
 *
 * Where the time in each zone is known, that *is* the dose: seven minutes above
 * threshold is a key session whether the session lasted thirty minutes or two
 * hours, and training load says little about it. Where it is missing, only the
 * average intensity remains, and that systematically flatters interval work — so
 * there a minimum load has to stand in for evidence.
 */
export const isHardActivity = (activity: Activity): boolean =>
  activity.load >= 90 ||
  (HARD_STIMULI.includes(inferStimulus(activity)) &&
    (hasZones(activity) || activity.load >= MIN_QUALITY_LOAD))

const round = (value: number): number => Math.round(value * 10) / 10
