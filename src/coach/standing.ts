import type { Activity, AthleteProfile, Goal, Sport, SportStanding, StandingPoint, Wellness } from './types.ts'
import { addDays, diffDays } from './dates.ts'
import { goalForSport } from './phase.ts'
import { ftpOf, thresholdFor } from './thresholds.ts'

/**
 * What the athlete could do today if it counted: the FTP on the bike, a race
 * time over the goal distance on foot. Both are estimates from training, said
 * as such — a test or a race is still the better measurement, and the page
 * that shows these marks the difference.
 */

/** One reading a week, read on the same weekday as today. */
const STEP_DAYS = 7
/** How far back the trend towards the goal is read: long enough to see through a bad week. */
const TREND_DAYS = 56
/** What "in the last four weeks" means for the change shown under the number. */
const CHANGE_DAYS = 28
/** Runs that speak for today's running: six weeks, as a block of training. */
const RUN_WINDOW_DAYS = 42
/** Fewer runs than this and the reading is one run's mood. */
const MIN_RUNS = 3
/**
 * Which of the runs' readings stands for the athlete. Not the middle one: what
 * goes wrong on a run — heat, drift, tired legs, a hill the elevation missed —
 * only ever makes it read worse, never better. So the upper quarter.
 */
const READING_QUANTILE = 0.75
/** The goal is out of sight beyond this: a trend is not a promise for years ahead. */
const LONGEST_FORECAST_DAYS = 730
/** Without a race goal a runner still wants a number; ten kilometres is the common one. */
const DEFAULT_RACE_KM = 10

/** Running is planned against a race; with no goal, against this distance. */
export const raceDistanceFor = (goals: readonly Goal[], today: string): { readonly km: number; readonly goal: Goal | null } => {
  const goal = goalForSport(
    goals.filter((entry) => entry.kind === 'raceTime' && entry.distanceKm !== undefined),
    'Run',
    today,
  )
  return { km: goal?.distanceKm ?? DEFAULT_RACE_KM, goal: goal ?? null }
}

// ------------------------------------------------------------------ running

/** Oxygen cost of running at a speed in metres per minute (Daniels & Gilbert). */
const oxygenCost = (metresPerMinute: number): number =>
  -4.6 + 0.182258 * metresPerMinute + 0.000104 * metresPerMinute ** 2

/** Share of VO2max that can be held all out for this many minutes (Daniels & Gilbert). */
const sustainable = (minutes: number): number =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)

/** The running fitness a performance proves: VDOT, as Daniels tabulates it. */
const vdotOfEffort = (metres: number, seconds: number): number =>
  oxygenCost(metres / (seconds / 60)) / sustainable(seconds / 60)

/** The time over a distance a VDOT predicts, found by halving the interval. */
export const raceSeconds = (vdot: number, metres: number): number => {
  const [low, high] = Array.from({ length: 60 }).reduce<readonly [number, number]>(
    ([fast, slow]) => {
      const middle = (fast + slow) / 2
      // A faster time than the fitness allows asks for more than it has.
      return vdotOfEffort(metres, middle * 60) > vdot ? [middle, slow] : [fast, middle]
    },
    [3, 900],
  )
  return Math.round(((low + high) / 2) * 60)
}

/** Below this share of the heart rate reserve a run says more about the weather than the athlete. */
const MIN_RESERVE = 0.5
const MIN_RUN_SECONDS = 20 * 60
const MIN_RUN_METRES = 3000
/** Climbing costs oxygen the flat formula does not count; hilly runs are left out rather than guessed. */
const MAX_CLIMB_PER_KM = 20
/** Outside this a reading is a broken sensor, not a runner. */
const PLAUSIBLE_VDOT: readonly [number, number] = [20, 85]

type RunReading = {
  readonly date: string
  /** From pace and heart rate: what the run says about the engine. */
  readonly fromHeart: number | null
  /** From pace alone: what the run proved could be held for that long. A floor, never the estimate. */
  readonly proven: number
}

type Heart = { readonly rest: number; readonly max: number }

const plausible = (vdot: number): boolean => vdot >= PLAUSIBLE_VDOT[0] && vdot <= PLAUSIBLE_VDOT[1]

/**
 * The share of the heart rate reserve a run used is the share of the oxygen
 * reserve it used (Swain): so a run at 70 % of the reserve and 4:45/km tells
 * the maximum as well as a race would, without needing one.
 */
const readRun = (activity: Activity, heart: Heart | null): RunReading | null => {
  if (activity.sport !== 'Run' || activity.load <= 0) return null
  if (activity.movingTimeSec < MIN_RUN_SECONDS || activity.distanceM < MIN_RUN_METRES) return null
  if (activity.elevationM / (activity.distanceM / 1000) > MAX_CLIMB_PER_KM) return null
  const proven = vdotOfEffort(activity.distanceM, activity.movingTimeSec)
  const reserve =
    heart !== null && activity.averageHr !== null ? (activity.averageHr - heart.rest) / (heart.max - heart.rest) : null
  const cost = oxygenCost(activity.distanceM / (activity.movingTimeSec / 60))
  const fromHeart = reserve !== null && reserve >= MIN_RESERVE ? 3.5 + (cost - 3.5) / Math.min(reserve, 1) : null
  return {
    date: activity.date,
    fromHeart: fromHeart !== null && plausible(fromHeart) ? fromHeart : null,
    proven,
  }
}

/** The value below which this share of the values lies, between neighbours where it falls between two. */
const quantile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * share
  const below = Math.floor(position)
  const above = Math.min(below + 1, sorted.length - 1)
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below)
}

const median = (values: readonly number[]): number => quantile(values, 0.5)

/** Resting heart rate as the wellness record knows it, over the last month. */
const restingHeart = (wellness: readonly Wellness[], today: string): number | null => {
  const values = wellness
    .filter((entry) => diffDays(entry.date, today) >= 0 && diffDays(entry.date, today) < 30)
    .flatMap((entry) => (entry.restingHr !== null && entry.restingHr > 0 ? [entry.restingHr] : []))
  return values.length === 0 ? null : median(values)
}

/** Lactate threshold sits near nine tenths of the maximum; good enough where only it is known. */
const LTHR_SHARE_OF_MAX = 0.9

const heartFor = (profile: AthleteProfile, wellness: readonly Wellness[], today: string): Heart | null => {
  const rest = restingHeart(wellness, today)
  const max = profile.maxHr ?? (profile.lthr !== null ? Math.round(profile.lthr / LTHR_SHARE_OF_MAX) : null)
  return rest !== null && max !== null && max > rest + 40 ? { rest, max } : null
}

/** The fitness on a day: what the runs before it say, never below what one of them proved. */
const vdotOn = (readings: readonly RunReading[], date: string): number | null => {
  const window = readings.filter((entry) => {
    const age = diffDays(entry.date, date)
    return age >= 0 && age < RUN_WINDOW_DAYS
  })
  const fromHeart = window.flatMap((entry) => (entry.fromHeart === null ? [] : [entry.fromHeart]))
  if (fromHeart.length < MIN_RUNS) return null
  return Math.max(quantile(fromHeart, READING_QUANTILE), ...window.map((entry) => entry.proven))
}

/** Threshold pace is the pace of an all-out hour; what it proves is the fallback without heart rate. */
const vdotFromThreshold = (profile: AthleteProfile): number | null => {
  const threshold = thresholdFor(profile, 'Run')
  if (threshold?.metric !== 'pace') return null
  return vdotOfEffort(1000 * (3600 / threshold.thresholdSecPerKm), 3600)
}

// ------------------------------------------------------------------- shared

/** Every reading day from the start of the span to today, a week apart, ending on today. */
const readingDays = (today: string, span: number): readonly string[] =>
  Array.from({ length: Math.floor(span / STEP_DAYS) + 1 }, (_unused, index) => addDays(today, -index * STEP_DAYS)).reverse()

/** Change per day from a least-squares line through the recent points. */
const slopePerDay = (points: readonly StandingPoint[], today: string): number | null => {
  const recent = points.filter((point) => diffDays(point.date, today) < TREND_DAYS)
  if (recent.length < 3) return null
  const xs = recent.map((point) => -diffDays(point.date, today))
  const ys = recent.map((point) => point.value)
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length
  const spread = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
  if (spread === 0) return null
  return xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index]! - meanY), 0) / spread
}

const changeOver = (points: readonly StandingPoint[], today: string, current: number): number | null => {
  const then = [...points].reverse().find((point) => diffDays(point.date, today) >= CHANGE_DAYS)
  return then === undefined ? null : current - then.value
}

/**
 * Where the line through the last weeks meets the goal. Higher is better for
 * watts, lower for a race time; `better` says which.
 */
const forecast = (
  current: number,
  slope: number | null,
  goal: Goal | null,
  today: string,
  better: 1 | -1,
): Pick<SportStanding, 'reachBy' | 'verdict'> => {
  if (goal === null) return { reachBy: null, verdict: null }
  const missing = better * (goal.targetValue - current)
  if (missing <= 0) return { reachBy: null, verdict: 'reached' }
  const gaining = slope === null ? 0 : better * slope
  if (gaining <= 0) return { reachBy: null, verdict: 'stalled' }
  const days = Math.ceil(missing / gaining)
  if (days > LONGEST_FORECAST_DAYS) return { reachBy: null, verdict: 'stalled' }
  const reachBy = addDays(today, days)
  return {
    reachBy,
    verdict: goal.targetDate === undefined || reachBy <= goal.targetDate ? 'on-track' : 'late',
  }
}

const goalOf = (goal: Goal | null): SportStanding['goal'] =>
  goal === null ? null : { id: goal.id, value: goal.targetValue, date: goal.targetDate ?? null }

// -------------------------------------------------------------------- sports

const rideStanding = (
  wellness: readonly Wellness[],
  profile: AthleteProfile,
  goals: readonly Goal[],
  today: string,
  span: number,
): SportStanding | null => {
  const estimates = wellness
    .filter((entry) => entry.eftpBySport.Ride !== undefined && entry.date <= today)
    .sort((left, right) => left.date.localeCompare(right.date))
  const latestBy = (date: string): number | null =>
    [...estimates].reverse().find((entry) => entry.date <= date)?.eftpBySport.Ride ?? null
  const series = readingDays(today, span).flatMap((date) => {
    const value = latestBy(date)
    return value === null ? [] : [{ date, value: Math.round(value) }]
  })
  const setting = ftpOf(profile)
  const current = series.at(-1)?.value ?? setting
  if (current === null) return null
  const goal = goalForSport(goals.filter((entry) => entry.kind === 'ftp'), 'Ride', today) ?? null
  return {
    sport: 'Ride',
    measure: 'ftp',
    distanceKm: null,
    current,
    change: changeOver(series, today, current),
    series,
    goal: goalOf(goal),
    source: series.length > 0 ? 'eftp' : 'setting',
    ...forecast(current, slopePerDay(series, today), goal, today, 1),
  }
}

const runStanding = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  profile: AthleteProfile,
  goals: readonly Goal[],
  today: string,
  span: number,
): SportStanding | null => {
  const { km, goal } = raceDistanceFor(goals, today)
  const metres = km * 1000
  const heart = heartFor(profile, wellness, today)
  const readings = activities.flatMap((activity) => {
    const reading = readRun(activity, heart)
    return reading === null ? [] : [reading]
  })
  const series = readingDays(today, span).flatMap((date) => {
    const vdot = vdotOn(readings, date)
    return vdot === null ? [] : [{ date, value: raceSeconds(vdot, metres) }]
  })
  const fallback = vdotFromThreshold(profile)
  const current = series.at(-1)?.value ?? (fallback === null ? null : raceSeconds(fallback, metres))
  if (current === null) return null
  return {
    sport: 'Run',
    measure: 'race',
    distanceKm: km,
    current,
    change: changeOver(series, today, current),
    series,
    goal: goalOf(goal),
    source: series.length > 0 ? 'runs' : 'setting',
    ...forecast(current, slopePerDay(series, today), goal, today, -1),
  }
}

export const buildStanding = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  profile: AthleteProfile,
  goals: readonly Goal[],
  sports: readonly Sport[],
  today: string,
  span: number,
): readonly SportStanding[] =>
  [
    sports.includes('Ride') ? rideStanding(wellness, profile, goals, today, span) : null,
    sports.includes('Run') ? runStanding(activities, wellness, profile, goals, today, span) : null,
  ].filter((entry): entry is SportStanding => entry !== null)
