import type {
  Activity,
  RaceDetails,
  RaceSample,
  Stimulus,
  WorkoutTemplate,
  ZrlFormat,
  ZrlRace,
} from './types.ts'
import { ZRL_FORMAT_LABELS } from './types.ts'

/** Zwift names every league race after it: "Zwift - TTT: Zwift Racing League: … on <route> in <world>". */
const ZRL_PATTERN = /zwift racing league/i
const TTT_PATTERN = /zwift - ttt:/i

export const ZRL_TEMPLATE_ID = 'zrl-race'

/** The athlete's own pre-race routine: 14 to 31 minutes, around IF 0.72. */
const WARMUP_MINUTES = 20
const WARMUP_INTENSITY = 72
/** Without any history of their own: a mid-pack Zwift pace, clearly marked as a guess. */
const FALLBACK_SPEED_KMH = 36
/**
 * A recorded race is longer than route and lead-in: Zwift keeps counting in the
 * pen and after the line. Across ten league races of 2025 the median was 2.75 km,
 * and speed is learned from those same recordings, so the course needs it too.
 */
const EXTRA_RIDING_KM = 2.75
const FALLBACK_MINUTES = 55
const FALLBACK_INTENSITY: Readonly<Record<Kind, number>> = { mass: 92, ttt: 90, truth: 90 }
/** Enough races for climbing to explain speed; below this the median speed is steadier. */
const MIN_FIT_SAMPLES = 4
const MIN_OWN_SAMPLES = 2
const SPEED_RANGE_KMH = [20, 50] as const

type Kind = 'mass' | 'ttt' | 'truth'

const KIND_OF_FORMAT: Readonly<Record<ZrlFormat, Kind>> = {
  scratch: 'mass',
  points: 'mass',
  ttt: 'ttt',
  truth: 'truth',
}

/** Riding in a bunch is repeated surges; riding against the clock is sustained threshold. */
const STIMULUS_OF_KIND: Readonly<Record<Kind, Stimulus>> = {
  mass: 'VO2',
  ttt: 'THRESHOLD',
  truth: 'THRESHOLD',
}

/**
 * A race is its own session, not a proposal done differently. Taken for one, a
 * race full of VO2max minutes would unlock a progression level it never earned.
 */
export const isZrlRace = (activity: Pick<Activity, 'name'>): boolean =>
  ZRL_PATTERN.test(activity.name)

export const raceSamples = (activities: readonly Activity[]): readonly RaceSample[] =>
  activities
    .filter((activity) => isZrlRace(activity) && activity.movingTimeSec > 0 && activity.load > 0)
    .map((activity) => ({
      date: activity.date,
      teamTimeTrial: TTT_PATTERN.test(activity.name),
      minutes: activity.movingTimeSec / 60,
      distanceKm: activity.distanceM / 1000,
      elevationM: activity.elevationM,
      intensity: activity.intensity,
      load: activity.load,
    }))

export const zrlRaceOn = (races: readonly ZrlRace[], date: string): ZrlRace | null =>
  races.find((race) => race.date === date) ?? null

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const clampSpeed = (speed: number): number =>
  Math.min(Math.max(speed, SPEED_RANGE_KMH[0]), SPEED_RANGE_KMH[1])

type Point = { readonly climb: number; readonly speed: number }

const pointsOf = (samples: readonly RaceSample[]): readonly Point[] =>
  samples
    .filter((sample) => sample.distanceKm > 0 && sample.minutes > 0)
    .map((sample) => ({
      climb: sample.elevationM / sample.distanceKm,
      speed: sample.distanceKm / (sample.minutes / 60),
    }))

/** Speed against metres climbed per kilometre. Climbing never makes a race faster. */
const speedFor = (points: readonly Point[], climb: number): number => {
  const typical = median(points.map((point) => point.speed))
  if (typical === null) return FALLBACK_SPEED_KMH
  if (points.length < MIN_FIT_SAMPLES) return clampSpeed(typical)

  const meanClimb = points.reduce((sum, point) => sum + point.climb, 0) / points.length
  const meanSpeed = points.reduce((sum, point) => sum + point.speed, 0) / points.length
  const spread = points.reduce((sum, point) => sum + (point.climb - meanClimb) ** 2, 0)
  if (spread === 0) return clampSpeed(typical)
  const slope =
    points.reduce((sum, point) => sum + (point.climb - meanClimb) * (point.speed - meanSpeed), 0) /
    spread
  return clampSpeed(meanSpeed + Math.min(slope, 0) * (climb - meanClimb))
}

const loadOf = (minutes: number, intensity: number): number =>
  (minutes / 60) * (intensity / 100) ** 2 * 100

export type RaceEstimate = {
  readonly minutes: number
  readonly raceMinutes: number
  readonly warmupMinutes: number
  readonly load: number
  readonly stimulus: Stimulus
  readonly distanceKm: number | null
  readonly elevationM: number | null
  readonly basedOn: number
  readonly rough: boolean
}

/**
 * What the coming race will cost, from the athlete's own races: how hard they
 * ride each kind, and how fast they get round a course with this much climbing.
 * Published figures per format do not exist, so the history is the only honest source.
 */
export const estimateRace = (
  race: ZrlRace,
  history: readonly RaceSample[],
  entered: readonly ZrlRace[],
): RaceEstimate => {
  const kindOf = (sample: RaceSample): Kind => {
    const format = zrlRaceOn(entered, sample.date)?.format
    return format ? KIND_OF_FORMAT[format] : sample.teamTimeTrial ? 'ttt' : 'mass'
  }
  const kind = KIND_OF_FORMAT[race.format]
  const own = history.filter((sample) => kindOf(sample) === kind)
  // A new format borrows from the closest one until it has a history of its own.
  const same =
    kind === 'truth' && own.length < MIN_OWN_SAMPLES
      ? history.filter((sample) => kindOf(sample) !== 'mass')
      : own

  const intensity =
    median((same.length >= MIN_OWN_SAMPLES ? same : history).map((sample) => sample.intensity)) ??
    FALLBACK_INTENSITY[kind]

  const route = race.route
  const distanceKm = route ? route.distanceKm * race.laps + route.leadInKm : null
  const elevationM = route ? route.elevationM * race.laps + route.leadInElevationM : null
  const fitted = pointsOf(same.length >= MIN_FIT_SAMPLES ? same : history)
  const raceMinutes = Math.round(
    distanceKm !== null && elevationM !== null
      ? (60 * (distanceKm + EXTRA_RIDING_KM)) / speedFor(fitted, elevationM / distanceKm)
      : (median(same.map((sample) => sample.minutes)) ??
          median(history.map((sample) => sample.minutes)) ??
          FALLBACK_MINUTES),
  )

  return {
    minutes: raceMinutes + WARMUP_MINUTES,
    raceMinutes,
    warmupMinutes: WARMUP_MINUTES,
    load: Math.round(loadOf(raceMinutes, intensity) + loadOf(WARMUP_MINUTES, WARMUP_INTENSITY)),
    stimulus: STIMULUS_OF_KIND[kind],
    distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
    elevationM: elevationM === null ? null : Math.round(elevationM),
    basedOn: same.length,
    rough: same.length < MIN_OWN_SAMPLES || route === null,
  }
}

const ALL_PHASES = ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'] as const

export const raceTemplate = (race: ZrlRace, estimate: RaceEstimate): WorkoutTemplate => ({
  id: ZRL_TEMPLATE_ID,
  sport: 'Ride',
  stimulus: estimate.stimulus,
  name: `ZRL ${ZRL_FORMAT_LABELS[race.format]}${race.route ? ` · ${race.route.name}` : ''}`,
  minutes: estimate.minutes,
  load: estimate.load,
  phases: ALL_PHASES,
  occasion: 'race',
  coachNote: estimate.rough
    ? 'Grobe Schätzung — es fehlen eigene Rennen dieser Art oder die Route. Nach dem Rennen wird sie genauer.'
    : `Geschätzt aus ${estimate.basedOn} deiner Rennen dieser Art. Nicht dabei? Die Alternative daneben hält die Woche genauso.`,
  blocks: [
    {
      kind: 'step',
      duration: `${estimate.warmupMinutes}m`,
      target: 'ramp 50%-75%',
      label: 'Aufwärmen',
    },
    { kind: 'step', duration: `${estimate.raceMinutes}m`, target: 'Rennen' },
  ],
})

export const raceDetails = (race: ZrlRace, estimate: RaceEstimate): RaceDetails => ({
  race,
  raceMinutes: estimate.raceMinutes,
  distanceKm: estimate.distanceKm,
  elevationM: estimate.elevationM,
  basedOn: estimate.basedOn,
  rough: estimate.rough,
})
