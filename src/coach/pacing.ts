import type { ForecastRange, Goal, RacePacing, Step } from './types.ts'
import { formatSeconds } from './dates.ts'
import { t } from './lang.ts'

/**
 * How a race is run, in stretches the watch can show: a controlled start, an
 * even middle, and a finish where whatever is left is spent. Even pacing is
 * what the fastest times are run with; the start a little slower keeps the
 * first kilometres in the crowd from costing the last ones.
 */

/** How much slower the start and how much faster the finish, as shares of the even pace. */
const START_SLOWER = 0.015
const FINISH_FASTER = 0.015
/** The marathon is too long to bank on a fast finish: both ends stay closer to even. */
const MARATHON_SHIFT = 0.01
/** The middle is split so no one step on the watch runs longer than this. */
const LONGEST_STEP_KM = 10
/** Either side of the target pace: GPS jitters by about this much from second to second. */
const PACE_BAND_SEC = 4

const isMarathon = (km: number): boolean => km >= 35

/** Kilometres of controlled start: a fifth of the race, five in a marathon. */
const startKm = (km: number): number => (isMarathon(km) ? 5 : Math.max(1, Math.round(km * 0.2)))

/** Where the even middle ends, a whole kilometre before the finish stretch. */
const finishFrom = (km: number): number => {
  const finish = km < 8 ? 1 : km < 15 ? 2 : isMarathon(km) ? 2 : 3
  return Math.max(startKm(km), Math.floor(km - finish))
}

/**
 * The stretches with their pace: each at a share of an even pace, and the even
 * pace set so the whole adds up to the target time.
 */
export const pacingPlan = (distanceKm: number, targetSeconds: number): RacePacing['segments'] => {
  const shift = isMarathon(distanceKm) ? MARATHON_SHIFT : null
  const start = startKm(distanceKm)
  const finish = finishFrom(distanceKm)
  const middle = Array.from({ length: Math.ceil((finish - start) / LONGEST_STEP_KM) }, (_unused, index) => ({
    fromKm: start + index * LONGEST_STEP_KM,
    toKm: Math.min(finish, start + (index + 1) * LONGEST_STEP_KM),
    kind: 'steady' as const,
    factor: 1,
  }))
  const stretches = [
    { fromKm: 0, toKm: start, kind: 'start' as const, factor: 1 + (shift ?? START_SLOWER) },
    ...middle,
    ...(finish < distanceKm
      ? [{ fromKm: finish, toKm: distanceKm, kind: 'finish' as const, factor: 1 - (shift ?? FINISH_FASTER) }]
      : []),
  ].filter((stretch) => stretch.toKm > stretch.fromKm)
  const weighted = stretches.reduce((sum, stretch) => sum + (stretch.toKm - stretch.fromKm) * stretch.factor, 0)
  const even = targetSeconds / weighted
  return stretches.map(({ fromKm, toKm, kind, factor }) => ({
    fromKm,
    toKm,
    kind,
    secPerKm: Math.round(even * factor),
  }))
}

/**
 * Which time the race is paced on. The goal where the forecast holds it
 * possible; the likely time where the goal is out of reach, because a start
 * at a pace the legs do not have is paid for at the end; the likely time too
 * where the goal sits well behind it, since pacing on it would give time away.
 * Without a forecast the goal, as set.
 */
export const pacingTarget = (goal: Goal, forecast: ForecastRange | null): Pick<RacePacing, 'targetSeconds' | 'basis'> => {
  if (forecast === null) return { targetSeconds: goal.targetValue, basis: 'goal' }
  if (goal.targetValue < forecast.best) return { targetSeconds: forecast.likely, basis: 'forecast-goal-out-of-reach' }
  if (goal.targetValue > forecast.worst) return { targetSeconds: forecast.likely, basis: 'forecast-goal-safe' }
  return { targetSeconds: goal.targetValue, basis: 'goal' }
}

export const racePacing = (goal: Goal, forecast: ForecastRange | null): RacePacing | null => {
  if (goal.sport !== 'Run' || goal.kind !== 'raceTime' || goal.distanceKm === undefined || !(goal.distanceKm > 0)) return null
  const target = pacingTarget(goal, forecast)
  return { ...target, distanceKm: goal.distanceKm, segments: pacingPlan(goal.distanceKm, target.targetSeconds) }
}

/** A stretch's length as intervals.icu reads it: whole kilometres, otherwise metres. */
const lengthOf = (fromKm: number, toKm: number): string => {
  const km = toKm - fromKm
  return Number.isInteger(km) ? `${km}km` : `${Math.round(km * 1000)}mtr`
}

const SEGMENT_LABEL = (kind: RacePacing['segments'][number]['kind']): string =>
  kind === 'start' ? t('Start kontrolliert') : kind === 'finish' ? t('Finish: was übrig ist') : t('Gleichmäßig')

/**
 * The stretches as steps the watch counts down by distance, each with a pace
 * range around its target: intervals.icu hands absolute paces on to Garmin.
 */
export const pacingSteps = (pacing: RacePacing): readonly Step[] =>
  pacing.segments.map((segment) => ({
    kind: 'step',
    duration: lengthOf(segment.fromKm, segment.toKm),
    target: `${formatSeconds(segment.secPerKm - PACE_BAND_SEC)}-${formatSeconds(segment.secPerKm + PACE_BAND_SEC)}/km Pace`,
    label: SEGMENT_LABEL(segment.kind),
  }))
