import type { AthleteProfile, CoachConfig, Goal, Phase, Sport } from './types.ts'
import { diffDays, weeksBetween } from './dates.ts'

/** Weeks remaining until a goal date, or null for open-ended goals. */
export const weeksToGoal = (goal: Goal, today: string): number | null =>
  goal.targetDate ? Math.ceil(diffDays(today, goal.targetDate) / 7) : null

const byUrgency = (today: string) => (left: Goal, right: Goal): number => {
  const leftWeeks = weeksToGoal(left, today) ?? Number.POSITIVE_INFINITY
  const rightWeeks = weeksToGoal(right, today) ?? Number.POSITIVE_INFINITY
  if (leftWeeks !== rightWeeks) return leftWeeks - rightWeeks
  return left.priority === right.priority ? 0 : left.priority === 'A' ? -1 : 1
}

/** Goals whose date has passed no longer steer the plan. */
const active = (goals: readonly Goal[], today: string): readonly Goal[] =>
  goals.filter((goal) => (weeksToGoal(goal, today) ?? 1) >= 0)

export const primaryGoal = (goals: readonly Goal[], today: string): Goal | undefined =>
  [...active(goals, today)].sort(byUrgency(today))[0]

export const goalForSport = (
  goals: readonly Goal[],
  sport: Sport,
  today: string,
): Goal | undefined =>
  [...active(goals, today)].filter((goal) => goal.sport === sport).sort(byUrgency(today))[0]

/** Every fourth week is a recovery week, anchored on the plan start date. */
export const isRecoveryWeek = (planStart: string, today: string): boolean =>
  weeksBetween(planStart, today) % 4 === 3

const datedPhase = (weeksLeft: number): Phase => {
  if (weeksLeft <= 1) return 'TAPER'
  if (weeksLeft <= 4) return 'SPECIFIC'
  if (weeksLeft <= 10) return 'BUILD'
  return 'BASE'
}

/** Open-ended goals cycle through two four-week blocks: base, then build. */
const openEndedPhase = (planStart: string, today: string): Phase => {
  const block = Math.floor(weeksBetween(planStart, today) / 4)
  return block % 2 === 0 ? 'BASE' : 'BUILD'
}

export const phaseForSport = (config: CoachConfig, sport: Sport, today: string): Phase => {
  const goal = goalForSport(config.goals, sport, today)
  const weeksLeft = goal ? weeksToGoal(goal, today) : null
  const phase = weeksLeft === null ? openEndedPhase(config.planStart, today) : datedPhase(weeksLeft)
  if (phase === 'TAPER') return phase
  return isRecoveryWeek(config.planStart, today) ? 'RECOVERY' : phase
}

const PHASE_HARD_BUDGET: Readonly<Record<Phase, number>> = {
  BASE: 2,
  BUILD: 3,
  SPECIFIC: 3,
  TAPER: 2,
  RECOVERY: 1,
}

/**
 * Hard sessions per week. Capped by what the athlete can actually fit in, since
 * low-volume plans need at least one easy or long session as a base.
 */
export const weeklyHardBudget = (phase: Phase, profile: AthleteProfile): number => {
  const phaseBudget = PHASE_HARD_BUDGET[phase]
  const volumeBudget = Math.max(1, profile.weeklySessions - 1)
  return Math.min(phaseBudget, volumeBudget)
}

export const PHASE_LABELS: Readonly<Record<Phase, string>> = {
  BASE: 'Grundlage',
  BUILD: 'Aufbau',
  SPECIFIC: 'Spezifisch',
  TAPER: 'Tapering',
  RECOVERY: 'Erholungswoche',
}
