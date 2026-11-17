import type { CoachConfig, DayType, ForecastRange, Goal, PlannedSession, RacePacing, Sport, Step, WorkoutTemplate } from './types.ts'
import { pacingSteps, racePacing } from './pacing.ts'
import { addDays, formatClock } from './dates.ts'
import { breakLimit } from './breaks.ts'
import { projectedRaceTime } from './feasibility.ts'
import { formatDistance } from './format.ts'
import { tapers } from './phase.ts'
import { buildSession } from './session.ts'
import { t } from './lang.ts'

/**
 * The race days the athlete set as goals: a race time with a date. Every one of
 * them is raced, main goal or side goal, and every one of them shapes the days
 * around it in every sport — the fatigue of a hard ride on Friday is still in the
 * legs at Sunday's 10k.
 */

type Decision = {
  readonly dayType: DayType
  readonly reason: string
  readonly optional: boolean
  readonly easyOnly?: boolean
}

export type GoalRacesAround = {
  /** The race of the day itself. */
  readonly race: Goal | null
  /** Tomorrow's race, when the days before it are kept fresh. */
  readonly raceTomorrow: Goal | null
  /** A race the day after tomorrow, when the days before it are kept fresh. */
  readonly raceInTwoDays: Goal | null
}

const NONE: GoalRacesAround = { race: null, raceTomorrow: null, raceInTwoDays: null }

const raceOn = (config: CoachConfig, sports: readonly Sport[], date: string): Goal | null => {
  // A race on a declared break is not going to be run, so it shapes nothing.
  if (breakLimit(config.breaks, date) !== null) return null
  const races = config.goals.filter(
    (goal) => goal.kind === 'raceTime' && goal.targetDate === date && sports.includes(goal.sport),
  )
  return races.find((goal) => goal.priority === 'A') ?? races[0] ?? null
}

export const goalRacesAround = (config: CoachConfig, sports: readonly Sport[], date: string): GoalRacesAround => {
  if (breakLimit(config.breaks, date) !== null) return NONE
  const tapered = (goal: Goal | null): Goal | null => (goal !== null && tapers(goal) ? goal : null)
  return {
    race: raceOn(config, sports, date),
    raceTomorrow: tapered(raceOn(config, sports, addDays(date, 1))),
    raceInTwoDays: tapered(raceOn(config, sports, addDays(date, 2))),
  }
}

/**
 * Race day is a quality day whatever the plan had in mind: the race is the
 * session. The day before is easy in every sport, with short openers in the
 * race's own; two days before, no sport gets hard work. Without taper only the
 * race day itself is fixed — the athlete races out of full training.
 */
export const aroundGoalRace = <D extends Decision>(decision: D, around: GoalRacesAround): D | Decision => {
  const { race, raceTomorrow, raceInTwoDays } = around
  if (race) {
    return {
      dayType: 'KEY',
      optional: false,
      reason: t`${race.label} — Wettkampftag. Heute zählt nur das Rennen.`,
    }
  }
  if (raceTomorrow) {
    return {
      dayType: 'EASY',
      optional: false,
      easyOnly: true,
      reason: t`Morgen ${raceTomorrow.label} — heute locker mit kurzen Steigerungen, in keiner Sportart etwas Hartes`,
    }
  }
  if (raceInTwoDays && decision.dayType === 'KEY') {
    return {
      dayType: 'EASY',
      optional: false,
      easyOnly: true,
      reason: t`In zwei Tagen ${raceInTwoDays.label} — ab jetzt keine harte Einheit mehr, auch nicht in der anderen Sportart`,
    }
  }
  return decision
}

const WARMUP_MINUTES = 15
/** Riegel's 1.06: the share of threshold a race of a given length is held at. */
const RIEGEL_EXPONENT = 0.06 / 1.06

const warmup = (sport: Sport): Step =>
  sport === 'Ride'
    ? { kind: 'step', duration: `${WARMUP_MINUTES}m`, target: 'ramp 50%-75%', label: t('Aufwärmen') }
    : { kind: 'step', duration: `${WARMUP_MINUTES}m`, target: '65-78% Pace', label: t('Aufwärmen') }

const stimulusFor = (raceMinutes: number): WorkoutTemplate['stimulus'] => {
  if (raceMinutes <= 20) return 'VO2'
  if (raceMinutes <= 75) return 'THRESHOLD'
  return 'LONG'
}

export const GOAL_RACE_TEMPLATE_ID = 'goal-race'

/** The race as a session: the time it should take, the load it will cost, and for a run how to pace it. */
export const goalRaceTemplate = (goal: Goal, config: CoachConfig, forecast: ForecastRange | null = null): WorkoutTemplate => {
  const projected = projectedRaceTime(config.profile, goal.sport, goal.distanceKm)
  const pacing = racePacing(goal, forecast)
  const raceSeconds = pacing?.targetSeconds ?? projected ?? goal.currentValue
  const raceMinutes = Math.max(1, Math.round(raceSeconds / 60))
  const intensity = (60 / raceMinutes) ** RIEGEL_EXPONENT
  const load = Math.round((raceMinutes / 60) * 100 * intensity ** 2 + (WARMUP_MINUTES / 60) * 100 * 0.6 ** 2)
  const distance = goal.distanceKm === undefined ? '' : `${formatDistance(goal.sport, goal.distanceKm)} · `
  const estimated = forecast ? forecast.likely : raceSeconds
  return {
    id: GOAL_RACE_TEMPLATE_ID,
    sport: goal.sport,
    stimulus: stimulusFor(raceMinutes),
    name: goal.label,
    minutes: WARMUP_MINUTES + raceMinutes,
    load,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    occasion: 'race',
    coachNote: pacing
      ? pacingNote(goal, pacing, forecast)
      : t`${distance}Zielzeit ${formatClock(goal.targetValue)}, aus deiner Form geschätzt ${formatClock(estimated)}. Den Anfang bewusst nicht schneller als die Zielpace angehen.`,
    blocks: [
      warmup(goal.sport),
      ...(pacing ? pacingSteps(pacing) : [{ kind: 'step' as const, duration: `${raceMinutes}m`, target: t('Rennen') }]),
    ],
  }
}

/** What the pacing is set on and why, then how to read the watch. */
const pacingNote = (goal: Goal, pacing: RacePacing, forecast: ForecastRange | null): string => {
  const distance = formatDistance(goal.sport, pacing.distanceKm)
  const target = formatClock(pacing.targetSeconds)
  const range = forecast ? t` Prognose ${formatClock(forecast.best)}–${formatClock(forecast.worst)}.` : ''
  const why =
    pacing.basis === 'forecast-goal-out-of-reach'
      ? t`Pacing auf ${target} statt auf dein Ziel ${formatClock(goal.targetValue)}: das liegt jenseits dessen, was dein Training gerade hergibt — zu schnell angegangen, kostet es hinten mehr, als es vorne bringt.`
      : pacing.basis === 'forecast-goal-safe'
        ? t`Pacing auf ${target}: dein Ziel ${formatClock(goal.targetValue)} ist damit sicher drin.`
        : t`Pacing auf dein Ziel ${target}.`
  return t`${distance} · ${why}${range} Die ersten Kilometer bewusst kontrolliert, dann gleichmäßig, zum Schluss, was übrig ist. Die Uhr misst meist etwas mehr als die Strecke: im Zweifel am schnellen Rand der Spanne laufen.`
}

export const goalRaceSession = (
  goal: Goal,
  config: CoachConfig,
  date: string,
  forecast: ForecastRange | null = null,
): PlannedSession => buildSession(goalRaceTemplate(goal, config, forecast), config, t`${goal.label} — Wettkampftag.`, date)
