import type {
  Activity,
  AthleteProfile,
  ForecastRange,
  Goal,
  Sport,
  SportStanding,
  StandingBasis,
  StandingInfluence,
  StandingPoint,
  StandingQuality,
  StandingTraining,
  Wellness,
} from './types.ts'
import { addDays, diffDays } from './dates.ts'
import { goalForSport, tapers } from './phase.ts'
import { ftpOf, thresholdFor } from './thresholds.ts'
import { CTL_DAYS, dailyLoads, ewmaSeries, HARD_STIMULI, inferStimulus } from './fitness.ts'
import { typicalFtpGainPerWeek } from './feasibility.ts'
import { oxygenCost, raceSeconds, vdotOfEffort } from './vdot.ts'
import { racePacing } from './pacing.ts'
import {
  type AerobicSignal,
  buildForecast,
  distanceForecasts,
  enduranceShortfall,
  RUN_TYPICAL_VDOT_PER_WEEK,
  rideShape,
  runShape,
  TAPER_DAYS,
  weeklyGains,
} from './forecast.ts'

export { raceSeconds } from './vdot.ts'

/**
 * What the athlete could do today if it counted: the FTP on the bike, a race
 * time over the goal distance on foot. Both are estimates from training, said
 * as such — a test or a race is still the better measurement, and the page
 * that shows these marks the difference. Each comes with what it rests on, how
 * far it can be leaned on, what bends it, and where it can be on race day.
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
/** Fewer runs than this in the window, or fewer weekly points in the trend, and the reading is thin. */
const SOLID_RUNS = 6
const SOLID_TREND_POINTS = 6
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
/** Without an FTP goal the bike's corridor looks this far ahead. */
const RIDE_HORIZON_DAYS = 56
/** eFTP is read from hard efforts; without one for this long it can only hold or sink. */
const HARD_RIDE_DAYS = 28
/** A change in fitness (CTL) this large over eight weeks is worth naming. */
const LOAD_CHANGE = 5

/** Running is planned against a race; with no goal, against this distance. */
export const raceDistanceFor = (goals: readonly Goal[], today: string): { readonly km: number; readonly goal: Goal | null } => {
  const goal = goalForSport(
    goals.filter((entry) => entry.kind === 'raceTime' && entry.distanceKm !== undefined),
    'Run',
    today,
  )
  return { km: goal?.distanceKm ?? DEFAULT_RACE_KM, goal: goal ?? null }
}

// ------------------------------------------------------------------ helpers

/** The value below which this share of the values lies, between neighbours where it falls between two. */
const quantile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * share
  const below = Math.floor(position)
  const above = Math.min(below + 1, sorted.length - 1)
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below)
}

const median = (values: readonly number[]): number => quantile(values, 0.5)

/** Days ago, counted from today: 0 is today, and the future is negative. */
const within = (date: string, today: string, days: number): boolean => {
  const age = diffDays(date, today)
  return age >= 0 && age < days
}

// ------------------------------------------------------------------ training

/** The training behind the number: fitness and its change, volume, the longest run, hard sessions. */
const trainingIn = (activities: readonly Activity[], sport: Sport, today: string): StandingTraining => {
  const loads = dailyLoads(activities, addDays(today, -180), today, sport)
  const ctl = ewmaSeries(loads, CTL_DAYS)
  const now = ctl.at(-1) ?? 0
  const then = ctl[ctl.length - 1 - TREND_DAYS] ?? 0
  const recent = activities.filter((activity) => activity.sport === sport && within(activity.date, today, RUN_WINDOW_DAYS))
  const weeks = RUN_WINDOW_DAYS / 7
  const hours = recent.reduce((sum, activity) => sum + activity.movingTimeSec, 0) / 3600 / weeks
  const km = recent.reduce((sum, activity) => sum + activity.distanceM, 0) / 1000 / weeks
  const longest = recent.reduce((most, activity) => Math.max(most, activity.distanceM), 0) / 1000
  const round = (value: number) => Math.round(value * 10) / 10
  return {
    ctl: Math.round(now),
    ctlChange: Math.round(now - then),
    weeklyHours: round(hours),
    weeklyKm: sport === 'Run' ? round(km) : null,
    longestKm: sport === 'Run' ? round(longest) : null,
    hardSessions: activities.filter((activity) => activity.sport === sport && within(activity.date, today, 28) && pushesHard(activity)).length,
  }
}

/** Work at or above threshold: what an estimate of the ceiling is read from. */
const pushesHard = (activity: Activity): boolean =>
  activity.load >= 40 && HARD_STIMULI.includes(inferStimulus(activity))

const loadInfluence = (training: StandingTraining): readonly StandingInfluence[] =>
  training.ctlChange >= LOAD_CHANGE
    ? [{ kind: 'load-rising', amount: training.ctlChange }]
    : training.ctlChange <= -LOAD_CHANGE
      ? [{ kind: 'load-falling', amount: -training.ctlChange }]
      : []

// -------------------------------------------------------- the bike's heart

/** A steady ride: long enough, easy enough, with power and heart rate both recorded. */
const STEADY_MIN_SECONDS = 40 * 60
const STEADY_INTENSITY: readonly [number, number] = [50, 85]
const MIN_STEADY_RIDES = 3
/** Below this the change in watts per beat is day-to-day noise. */
const AEROBIC_CHANGE = 2

/**
 * Watts per heartbeat on steady rides, the last four weeks against the four
 * before: the engine's direction, read where the power meter measures it. It
 * says nothing about a running pace — the heart sits lower on the bike and the
 * legs work differently — but where it rises, the engine a runner needs rises too.
 */
export const aerobicChange = (activities: readonly Activity[], today: string): number | null => {
  const efficiency = (from: number, to: number) =>
    activities.flatMap((activity) => {
      const age = diffDays(activity.date, today)
      const watts = activity.averageWatts ?? null
      const steady =
        activity.sport === 'Ride' &&
        age >= from &&
        age < to &&
        watts !== null &&
        watts > 0 &&
        activity.averageHr !== null &&
        activity.averageHr > 0 &&
        activity.movingTimeSec >= STEADY_MIN_SECONDS &&
        activity.intensity >= STEADY_INTENSITY[0] &&
        activity.intensity <= STEADY_INTENSITY[1]
      return steady ? [watts / activity.averageHr!] : []
    })
  const recent = efficiency(0, 28)
  const before = efficiency(28, 56)
  if (recent.length < MIN_STEADY_RIDES || before.length < MIN_STEADY_RIDES) return null
  return Math.round((median(recent) / median(before) - 1) * 1000) / 10
}

const aerobicSignal = (change: number | null): AerobicSignal =>
  change === null ? null : change >= AEROBIC_CHANGE ? 'up' : change <= -AEROBIC_CHANGE ? 'down' : 'flat'

const aerobicInfluence = (change: number | null): readonly StandingInfluence[] =>
  change === null || Math.abs(change) < AEROBIC_CHANGE
    ? []
    : [{ kind: change > 0 ? 'bike-aerobic-up' : 'bike-aerobic-down', amount: Math.abs(change) }]

// ------------------------------------------------------------------ running

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

/** Why a run could not speak for the engine. */
type Skip = 'short' | 'hilly' | 'no-hr' | 'easy' | 'implausible' | 'no-heart-values'

type Heart = { readonly rest: number; readonly max: number }

const plausible = (vdot: number): boolean => vdot >= PLAUSIBLE_VDOT[0] && vdot <= PLAUSIBLE_VDOT[1]

const isRun = (activity: Activity): boolean => activity.sport === 'Run' && activity.load > 0

/**
 * The share of the heart rate reserve a run used is the share of the oxygen
 * reserve it used (Swain): so a run at 70 % of the reserve and 4:45/km tells
 * the maximum as well as a race would, without needing one.
 */
const readRun = (activity: Activity, heart: Heart | null): { readonly reading: RunReading | null; readonly skip: Skip | null } => {
  if (activity.movingTimeSec < MIN_RUN_SECONDS || activity.distanceM < MIN_RUN_METRES) return { reading: null, skip: 'short' }
  if (activity.elevationM / (activity.distanceM / 1000) > MAX_CLIMB_PER_KM) return { reading: null, skip: 'hilly' }
  const proven = vdotOfEffort(activity.distanceM, activity.movingTimeSec)
  const reading = (fromHeart: number | null): RunReading => ({ date: activity.date, fromHeart, proven })
  if (activity.averageHr === null) return { reading: reading(null), skip: 'no-hr' }
  if (heart === null) return { reading: reading(null), skip: 'no-heart-values' }
  const reserve = (activity.averageHr - heart.rest) / (heart.max - heart.rest)
  if (reserve < MIN_RESERVE) return { reading: reading(null), skip: 'easy' }
  const cost = oxygenCost(activity.distanceM / (activity.movingTimeSec / 60))
  const fromHeart = 3.5 + (cost - 3.5) / Math.min(reserve, 1)
  return plausible(fromHeart) ? { reading: reading(fromHeart), skip: null } : { reading: reading(null), skip: 'implausible' }
}

/** Resting heart rate as the wellness record knows it, over the last month. */
const restingHeart = (wellness: readonly Wellness[], today: string): number | null => {
  const values = wellness
    .filter((entry) => within(entry.date, today, 30))
    .flatMap((entry) => (entry.restingHr !== null && entry.restingHr > 0 ? [entry.restingHr] : []))
  return values.length === 0 ? null : median(values)
}

/** Lactate threshold sits near nine tenths of the maximum; good enough where only it is known. */
const LTHR_SHARE_OF_MAX = 0.9

type HeartValues = { readonly heart: Heart | null; readonly influences: readonly StandingInfluence[] }

const heartFor = (profile: AthleteProfile, wellness: readonly Wellness[], today: string): HeartValues => {
  const rest = restingHeart(wellness, today)
  const max = profile.maxHr ?? (profile.lthr !== null ? Math.round(profile.lthr / LTHR_SHARE_OF_MAX) : null)
  const influences: readonly StandingInfluence[] = [
    ...(rest === null ? [{ kind: 'no-resting-hr' as const }] : []),
    ...(max === null ? [{ kind: 'no-max-hr' as const }] : []),
    ...(profile.maxHr === null && max !== null ? [{ kind: 'max-hr-from-lthr' as const }] : []),
  ]
  return { heart: rest !== null && max !== null && max > rest + 40 ? { rest, max } : null, influences }
}

/** The fitness on a day: what the runs before it say, never below what one of them proved. */
const vdotOn = (readings: readonly RunReading[], date: string): number | null => {
  const window = readings.filter((entry) => within(entry.date, date, RUN_WINDOW_DAYS))
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

const SKIP_INFLUENCE: Readonly<Partial<Record<Skip, StandingInfluence['kind']>>> = {
  hilly: 'hilly-runs',
  'no-hr': 'runs-without-hr',
  short: 'short-runs',
  easy: 'easy-runs',
}

// ------------------------------------------------------------------- shared

/** Every reading day from the start of the span to today, a week apart, ending on today. */
const readingDays = (today: string, span: number): readonly string[] =>
  Array.from({ length: Math.floor(span / STEP_DAYS) + 1 }, (_unused, index) => addDays(today, -index * STEP_DAYS)).reverse()

const inTrend = (points: readonly StandingPoint[], today: string): readonly StandingPoint[] =>
  points.filter((point) => diffDays(point.date, today) < TREND_DAYS)

/** Change per day from a least-squares line through the recent points. */
const slopePerDay = (points: readonly StandingPoint[], today: string): number | null => {
  const recent = inTrend(points, today)
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
 * watts, lower for a race time; `better` says which. Without a line there is
 * nothing to say about the way there — only whether the goal is already met.
 */
const forecastByTrend = (
  current: number,
  slope: number | null,
  goal: Goal | null,
  today: string,
  better: 1 | -1,
): Pick<SportStanding, 'reachBy' | 'verdict'> => {
  if (goal === null) return { reachBy: null, verdict: null }
  const missing = better * (goal.targetValue - current)
  if (missing <= 0) return { reachBy: null, verdict: 'reached' }
  if (slope === null) return { reachBy: null, verdict: null }
  const gaining = better * slope
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

/** A goal date still ahead, or none. */
const dateAhead = (goal: Goal | null, today: string): string | null =>
  goal?.targetDate !== undefined && goal.targetDate > today ? goal.targetDate : null

// -------------------------------------------------------------------- sports

const rideStanding = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  profile: AthleteProfile,
  goals: readonly Goal[],
  today: string,
  span: number,
  aerobic: number | null,
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
  const slope = slopePerDay(series, today)
  const training = trainingIn(activities, 'Ride', today)

  const lastHard = activities
    .filter((activity) => activity.sport === 'Ride' && activity.date <= today && pushesHard(activity))
    .reduce<string | null>((latest, activity) => (latest === null || activity.date > latest ? activity.date : latest), null)
  const sinceHard = lastHard === null ? null : diffDays(lastHard, today)
  const noHard = sinceHard === null || sinceHard >= HARD_RIDE_DAYS
  const trendPoints = inTrend(series, today).length
  const quality: StandingQuality =
    series.length === 0 || slope === null ? 'none' : noHard || trendPoints < SOLID_TREND_POINTS ? 'limited' : 'solid'
  const basis: StandingBasis = { used: trendPoints, considered: Math.floor(TREND_DAYS / STEP_DAYS) + 1, trendPoints }
  const influences: readonly StandingInfluence[] = [
    ...(noHard ? [{ kind: 'no-hard-rides' as const, ...(sinceHard === null ? {} : { amount: sinceHard }) }] : []),
    ...loadInfluence(training),
    ...aerobicInfluence(aerobic),
  ]

  const trendPerWeek = slope === null ? null : slope * 7
  const typical = typicalFtpGainPerWeek(current)
  const forecast = buildForecast(
    {
      today,
      date: dateAhead(goal, today) ?? addDays(today, RIDE_HORIZON_DAYS),
      fitness: current,
      gains: weeklyGains(trendPerWeek, typical, quality, aerobicSignal(aerobic)),
      quality,
      tapered: false,
      shortfall: 0,
      goal: goal?.targetValue ?? null,
    },
    rideShape,
  )

  return {
    sport: 'Ride',
    measure: 'ftp',
    distanceKm: null,
    current,
    change: changeOver(series, today, current),
    series,
    goal: goalOf(goal),
    source: series.length > 0 ? 'eftp' : 'setting',
    trendPerWeek,
    ...forecastByTrend(current, slope, goal, today, 1),
    quality,
    basis,
    influences,
    training,
    forecast,
    distances: [],
    pacing: null,
  }
}

const runStanding = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  profile: AthleteProfile,
  goals: readonly Goal[],
  today: string,
  span: number,
  aerobic: number | null,
  race: { readonly km: number; readonly goal: Goal | null } = raceDistanceFor(goals, today),
): SportStanding | null => {
  const { km, goal } = race
  const metres = km * 1000
  const { heart, influences: heartInfluences } = heartFor(profile, wellness, today)
  const read = activities.filter(isRun).map((activity) => ({ activity, ...readRun(activity, heart) }))
  const readings = read.flatMap((entry) => (entry.reading === null ? [] : [entry.reading]))
  const vdots = readingDays(today, span).flatMap((date) => {
    const vdot = vdotOn(readings, date)
    return vdot === null ? [] : [{ date, value: vdot }]
  })
  const series = vdots.map((point) => ({ date: point.date, value: raceSeconds(point.value, metres) }))
  const fitness = vdots.at(-1)?.value ?? vdotFromThreshold(profile)
  if (fitness === null) return null
  const current = raceSeconds(fitness, metres)
  const slope = slopePerDay(series, today)
  const vdotSlope = slopePerDay(vdots, today)
  const training = trainingIn(activities, 'Run', today)

  const recent = read.filter((entry) => within(entry.activity.date, today, RUN_WINDOW_DAYS))
  const used = recent.filter((entry) => entry.skip === null).length
  const trendPoints = inTrend(series, today).length
  const quality: StandingQuality =
    series.length === 0 || slope === null
      ? 'none'
      : used < SOLID_RUNS || trendPoints < SOLID_TREND_POINTS
        ? 'limited'
        : 'solid'
  const skipped = (Object.keys(SKIP_INFLUENCE) as Skip[]).flatMap((skip): readonly StandingInfluence[] => {
    const count = recent.filter((entry) => entry.skip === skip).length
    const kind = SKIP_INFLUENCE[skip]
    return count > 0 && kind !== undefined ? [{ kind, amount: count }] : []
  })
  const influences: readonly StandingInfluence[] = [
    ...heartInfluences,
    ...skipped,
    ...loadInfluence(training),
    ...aerobicInfluence(aerobic),
  ]

  const base = {
    today,
    fitness,
    gains: weeklyGains(vdotSlope === null ? null : vdotSlope * 7, RUN_TYPICAL_VDOT_PER_WEEK, quality, aerobicSignal(aerobic)),
    quality,
  }
  const raceDay = dateAhead(goal, today)
  const forecast = buildForecast(
    {
      ...base,
      date: raceDay ?? addDays(today, TAPER_DAYS),
      // A race goal keeps its taper unless switched off; without one the question is "if I tapered now".
      tapered: raceDay === null || goal === null ? true : tapers(goal),
      shortfall: enduranceShortfall(km, training),
      goal: goal?.targetValue ?? null,
    },
    runShape(metres),
  )

  return {
    sport: 'Run',
    measure: 'race',
    distanceKm: km,
    current,
    change: changeOver(series, today, current),
    series,
    goal: goalOf(goal),
    source: series.length > 0 ? 'runs' : 'setting',
    trendPerWeek: slope === null ? null : slope * 7,
    ...forecastByTrend(current, slope, goal, today, -1),
    quality,
    basis: { used, considered: recent.length, trendPoints },
    influences,
    training,
    forecast,
    distances: distanceForecasts(base, training),
    pacing: goal !== null && raceDay !== null ? racePacing(goal, forecast) : null,
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
): readonly SportStanding[] => {
  const aerobic = aerobicChange(activities, today)
  return [
    sports.includes('Ride') ? rideStanding(activities, wellness, profile, goals, today, span, aerobic) : null,
    sports.includes('Run') ? runStanding(activities, wellness, profile, goals, today, span, aerobic) : null,
  ].filter((entry): entry is SportStanding => entry !== null)
}

/**
 * Where the forecast puts race day for every running race goal ahead, by goal id:
 * what the race day's pacing is set on.
 */
export const raceForecasts = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  profile: AthleteProfile,
  goals: readonly Goal[],
  today: string,
): Readonly<Record<string, ForecastRange>> => {
  const aerobic = aerobicChange(activities, today)
  return Object.fromEntries(
    goals
      .filter((goal) => goal.sport === 'Run' && goal.kind === 'raceTime' && goal.distanceKm !== undefined && dateAhead(goal, today) !== null)
      .flatMap((goal) => {
        const forecast = runStanding(activities, wellness, profile, goals, today, TREND_DAYS, aerobic, {
          km: goal.distanceKm!,
          goal,
        })?.forecast
        return forecast ? [[goal.id, { best: forecast.best, likely: forecast.likely, worst: forecast.worst }] as const] : []
      }),
  )
}
