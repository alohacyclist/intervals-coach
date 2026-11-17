import type {
  CorridorPoint,
  DistanceForecast,
  ForecastRange,
  StandingForecast,
  StandingQuality,
  StandingTraining,
} from './types.ts'
import { addDays, diffDays } from './dates.ts'
import { raceSeconds } from './vdot.ts'

/**
 * Where the measure can be on a day ahead: the race day of a goal, or the end
 * of a taper begun today. Always a range — best case, likely, worst case — and
 * built from steps the page can name one by one: today's reading, what the
 * trend adds until then, what a taper gives, and, for the long races, what the
 * endurance not yet trained takes away.
 */

/** A taper from today: ten days of less, as before a race that counts. */
export const TAPER_DAYS = 10
/** Beyond this a trend is not a promise: weeks further out add width, not gain. */
const GAIN_WEEKS_CAP = 16

/**
 * What a taper gives on race day, as a share of performance. Studies put the
 * mean near two percent (Bosquet et al. 2007), most between one and three.
 */
const TAPER_GAIN: ForecastRange = { best: 0.03, likely: 0.02, worst: 0.01 }
const NO_TAPER: ForecastRange = { best: 0, likely: 0, worst: 0 }

/**
 * How far either way the reading of today may be off, by how well it rests on
 * data. The weeks ahead widen the range through the gains each case assumes,
 * not a second time here.
 */
const UNCERTAINTY: Readonly<Record<StandingQuality, number>> = { solid: 0.015, limited: 0.025, none: 0.04 }

/**
 * VDOT a runner in steady training gains in a week: Daniels moves it up by one
 * every four to six weeks. The best case is a block that lands: up to
 * three quarters more.
 */
export const RUN_TYPICAL_VDOT_PER_WEEK = 0.15

/** The race distances a runner asks about. */
export const RACE_DISTANCES_KM: readonly number[] = [5, 10, 21.0975, 42.195]

/**
 * Where the aerobic engine is heading by another measure, here the heart rate
 * against power on the bike. It stands in where the sport's own readings are thin.
 */
export type AerobicSignal = 'up' | 'flat' | 'down' | null

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/**
 * The gain per week each case assumes, in the measure's fitness unit (VDOT,
 * watts), positive for better. The likely case trusts the trend only as far as
 * the data carries it and never further than typical; the best case is a good
 * block; the worst case lets a falling trend run on at half its pace — a
 * slide in someone who keeps training rarely lasts — and no faster than half
 * the typical gain.
 */
export const weeklyGains = (
  trend: number | null,
  typical: number,
  quality: StandingQuality,
  aerobic: AerobicSignal,
): ForecastRange => {
  const usable = trend !== null && quality !== 'none'
  const measured = usable ? clamp(trend, 0, typical) : 0
  // Without a trend to read, what the rest of the training says.
  const prior = aerobic === 'up' ? typical * 0.75 : aerobic === 'down' ? 0 : typical * 0.5
  const likely = quality === 'solid' ? measured : quality === 'limited' ? (measured + prior) / 2 : prior
  return {
    best: Math.max(typical * 1.25, Math.min(usable ? trend : 0, typical * 1.75)),
    likely,
    worst: usable ? clamp(trend / 2, -typical / 2, 0) : 0,
  }
}

/**
 * What the long races ask beyond fitness: a VDOT read from short runs holds
 * over the half and the marathon only with the kilometres and the long runs
 * behind it. The share of performance the endurance not yet there costs —
 * zero up to 15 km, up to two percent over the half, up to ten in a marathon.
 */
export const enduranceShortfall = (distanceKm: number, training: StandingTraining): number => {
  if (distanceKm < 15) return 0
  const share = clamp((distanceKm - 15) / (42.195 - 15), 0, 1)
  const weeklyNeeded = 25 + 30 * share
  const longestNeeded = Math.min(30, distanceKm * 0.75)
  const most = 0.02 + 0.08 * share
  const volume = Math.min(1, (training.weeklyKm ?? 0) / weeklyNeeded)
  const long = Math.min(1, (training.longestKm ?? 0) / longestNeeded)
  return most * (1 - (volume + long) / 2)
}

/** Seconds are rounded to what a runner remembers: five on a 5 km, a minute on a marathon. */
export const roundRaceTime = (seconds: number): number => {
  const step = seconds < 1800 ? 5 : seconds < 3600 ? 15 : seconds < 7200 ? 30 : 60
  return Math.round(seconds / step) * step
}

type Shape = {
  /** From fitness and a share of performance gained (positive) or lost to the measure: seconds or watts. */
  readonly measure: (fitness: number, performance: number) => number
  /** Higher is better for watts, lower for a race time. */
  readonly better: 1 | -1
  readonly round: (value: number) => number
}

export const runShape = (metres: number): Shape => ({
  measure: (vdot, performance) => raceSeconds(vdot, metres) * (1 - performance),
  better: -1,
  round: roundRaceTime,
})

export const rideShape: Shape = {
  measure: (watts, performance) => watts * (1 + performance),
  better: 1,
  round: Math.round,
}

export type ForecastInput = {
  readonly today: string
  readonly date: string
  /** Today's fitness: VDOT on foot, watts on the bike. */
  readonly fitness: number
  readonly gains: ForecastRange
  readonly quality: StandingQuality
  readonly tapered: boolean
  /** Share of performance the missing endurance costs; zero on the bike and the short races. */
  readonly shortfall: number
  readonly goal: number | null
}

/** The share of a taper that has taken effect on a day: none before it begins, all on race day. */
const taperShare = (date: string, raceDay: string): number =>
  clamp((TAPER_DAYS - diffDays(date, raceDay)) / TAPER_DAYS, 0, 1)

const rangeOn = (input: ForecastInput, shape: Shape, date: string): ForecastRange => {
  const weeks = Math.max(0, diffDays(input.today, date) / 7)
  const gained = Math.min(weeks, GAIN_WEEKS_CAP)
  const width = UNCERTAINTY[input.quality]
  const taper = input.tapered ? TAPER_GAIN : NO_TAPER
  const share = taperShare(date, input.date)
  // Kilometres can still be built before a race weeks away; days before, they cannot.
  const bestShortfall = weeks >= 6 ? input.shortfall / 2 : input.shortfall
  return {
    best: shape.measure(input.fitness + input.gains.best * gained, share * taper.best - bestShortfall + width),
    likely: shape.measure(input.fitness + input.gains.likely * gained, share * taper.likely - input.shortfall),
    worst: shape.measure(input.fitness + input.gains.worst * gained, share * taper.worst - input.shortfall - width),
  }
}

/** Every week from today to the day, and the day itself. */
const corridorDays = (today: string, date: string): readonly string[] => {
  const days = Math.max(0, diffDays(today, date))
  const weekly = Array.from({ length: Math.floor(days / 7) + 1 }, (_unused, index) => addDays(today, index * 7))
  return weekly.at(-1) === date ? weekly : [...weekly, date]
}

const chanceOf = (goal: number | null, range: ForecastRange, better: 1 | -1): StandingForecast['goalChance'] => {
  if (goal === null) return null
  if (better * (goal - range.likely) <= 0) return 'likely'
  if (better * (goal - range.best) <= 0) return 'possible'
  return 'out-of-reach'
}

export const buildForecast = (input: ForecastInput, shape: Shape): StandingForecast => {
  const range = rangeOn(input, shape, input.date)
  const weeks = Math.min(Math.max(0, diffDays(input.today, input.date) / 7), GAIN_WEEKS_CAP)
  const fitnessThen = input.fitness + input.gains.likely * weeks
  const taper = input.tapered ? TAPER_GAIN.likely : 0
  const now = shape.measure(input.fitness, 0)
  const trained = shape.measure(fitnessThen, 0)
  const tapered = shape.measure(fitnessThen, taper)
  // Rounded as shown, so the goal is placed against the numbers the athlete reads.
  const shown = { best: shape.round(range.best), likely: shape.round(range.likely), worst: shape.round(range.worst) }
  return {
    date: input.date,
    tapered: input.tapered,
    ...shown,
    parts: {
      today: Math.round(now),
      trend: Math.round(trained - now),
      taper: Math.round(tapered - trained),
      endurance: Math.round(range.likely - tapered),
    },
    goalChance: chanceOf(input.goal, shown, shape.better),
    corridor: corridorDays(input.today, input.date).map(
      (date): CorridorPoint => ({ date, ...rangeOn(input, shape, date) }),
    ),
  }
}

/** What the same running fitness says over every race distance, with a taper from today. */
export const distanceForecasts = (
  base: Omit<ForecastInput, 'date' | 'tapered' | 'shortfall' | 'goal'>,
  training: StandingTraining,
): readonly DistanceForecast[] =>
  RACE_DISTANCES_KM.map((km) => {
    const shape = runShape(km * 1000)
    const range = rangeOn(
      { ...base, date: addDays(base.today, TAPER_DAYS), tapered: true, shortfall: enduranceShortfall(km, training), goal: null },
      shape,
      addDays(base.today, TAPER_DAYS),
    )
    return { km, best: shape.round(range.best), likely: shape.round(range.likely), worst: shape.round(range.worst) }
  })
