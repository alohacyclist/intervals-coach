import type { AthleteProfile, Goal, GoalKind, Sport } from '../coach/types.ts'
import { SPORT_LABELS } from '../coach/types.ts'
import { isIsoDate } from '../coach/config-schema.ts'
import { formatDistance } from '../coach/format.ts'
import { projectedRaceTime } from '../coach/feasibility.ts'
import { ftpOf } from '../coach/thresholds.ts'
import { formatClock, parseTime, timeError } from './format-input.ts'

/** A goal as the form holds it: text as typed, turned into a goal only when all of it reads. */
export type GoalDraft = {
  readonly id: string
  readonly kind: GoalKind
  readonly sport: Sport
  /** Empty means the label is written from the values. */
  readonly label: string
  /** Metres for swimming, kilometres otherwise — the unit each sport races in. */
  readonly distance: string
  /** Empty for a race time the threshold can predict. */
  readonly current: string
  readonly target: string
  readonly targetDate: string
  readonly priority: 'A' | 'B'
}

export type GoalField = 'distance' | 'current' | 'target' | 'targetDate'

export type GoalErrors = Partial<Readonly<Record<GoalField, string>>>

export const distanceUnit = (sport: Sport): string => (sport === 'Swim' ? 'm' : 'km')

const DISTANCE_PLACEHOLDER: Readonly<Record<Sport, string>> = { Ride: '40', Run: '10', Swim: '1500' }

export const distancePlaceholder = (sport: Sport): string => DISTANCE_PLACEHOLDER[sport]

export const emptyGoalDraft = (id: string, kind: GoalKind, sport: Sport): GoalDraft => ({
  id,
  kind,
  sport: kind === 'ftp' ? 'Ride' : sport,
  label: '',
  distance: '',
  current: '',
  target: '',
  targetDate: '',
  priority: 'A',
})

const distanceText = (sport: Sport, distanceKm: number | undefined): string => {
  if (distanceKm === undefined) return ''
  return sport === 'Swim' ? String(Math.round(distanceKm * 1000)) : String(distanceKm)
}

export const draftFromGoal = (goal: Goal): GoalDraft => ({
  id: goal.id,
  kind: goal.kind,
  sport: goal.sport,
  label: goal.label,
  distance: distanceText(goal.sport, goal.distanceKm),
  current: goal.kind === 'ftp' ? String(goal.currentValue) : formatClock(goal.currentValue),
  target: goal.kind === 'ftp' ? String(goal.targetValue) : formatClock(goal.targetValue),
  targetDate: goal.targetDate ?? '',
  priority: goal.priority,
})

const positiveNumber = (value: string): number | null => {
  const parsed = Number(value.trim().replace(',', '.'))
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** The distance in kilometres, whatever unit the sport is typed in. */
export const distanceKmOf = (draft: GoalDraft): number | null => {
  const value = positiveNumber(draft.distance)
  if (value === null) return null
  return draft.sport === 'Swim' ? value / 1000 : value
}

/** The race time the threshold predicts, when the athlete leaves their own blank. */
export const predictedTime = (draft: GoalDraft, profile: AthleteProfile): number | null =>
  projectedRaceTime(profile, draft.sport, distanceKmOf(draft) ?? undefined)

const dateError = (value: string, today: string): string | null => {
  if (value === '') return null
  if (!isIsoDate(value)) return 'Bitte ein gültiges Datum wählen'
  return value < today ? 'Das Datum liegt in der Vergangenheit' : null
}

const ftpErrors = (draft: GoalDraft, profile: AthleteProfile): GoalErrors => {
  const target = positiveNumber(draft.target)
  if (ftpOf(profile) === null) return { target: 'Ein FTP-Ziel braucht Rad mit FTP bei den Sportarten' }
  return target === null ? { target: 'FTP-Ziel in Watt, z. B. 300' } : {}
}

const raceErrors = (draft: GoalDraft, profile: AthleteProfile): GoalErrors => {
  const distance = distanceKmOf(draft) === null ? `Bitte die Distanz in ${distanceUnit(draft.sport)} eintragen` : null
  // Left blank, the current time comes from the threshold where there is a pace to project from.
  const predictable = projectedRaceTime(profile, draft.sport, 1) !== null
  const current = timeError(draft.current, !predictable)
  const target = timeError(draft.target, true)
  return Object.fromEntries(
    Object.entries({ distance, current, target }).filter(([, message]) => message !== null),
  ) as GoalErrors
}

export const goalErrors = (draft: GoalDraft, profile: AthleteProfile, today: string): GoalErrors => {
  const date = dateError(draft.targetDate, today)
  const own = draft.kind === 'ftp' ? ftpErrors(draft, profile) : raceErrors(draft, profile)
  return date === null ? own : { ...own, targetDate: date }
}

export const hasErrors = (errors: GoalErrors): boolean => Object.keys(errors).length > 0

const autoLabel = (draft: GoalDraft, distanceKm: number, target: number): string =>
  draft.kind === 'ftp'
    ? `FTP ${target} W`
    : `${formatDistance(draft.sport, distanceKm)} ${SPORT_LABELS[draft.sport]} in ${formatClock(target)}`

/** The goal the draft describes, or null while any field is still wrong. */
export const goalFromDraft = (draft: GoalDraft, profile: AthleteProfile, today: string): Goal | null => {
  if (hasErrors(goalErrors(draft, profile, today))) return null
  const dated = draft.targetDate === '' ? {} : { targetDate: draft.targetDate }
  const common = { id: draft.id, sport: draft.sport, kind: draft.kind, priority: draft.priority, ...dated }

  if (draft.kind === 'ftp') {
    const target = Math.round(positiveNumber(draft.target) ?? 0)
    return {
      ...common,
      label: draft.label.trim() || autoLabel(draft, 0, target),
      currentValue: ftpOf(profile) ?? 0,
      targetValue: target,
    }
  }

  const distanceKm = distanceKmOf(draft) ?? 0
  const target = parseTime(draft.target) ?? 0
  return {
    ...common,
    label: draft.label.trim() || autoLabel(draft, distanceKm, target),
    currentValue: parseTime(draft.current) ?? predictedTime(draft, profile) ?? 0,
    targetValue: target,
    distanceKm,
  }
}
