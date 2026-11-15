import type { AthleteProfile, CoachConfig, Goal, Phase, SeasonWeek, Sport } from './types.ts'
import { addDays, diffDays, startOfWeek, weeksBetween } from './dates.ts'
import { perLang, pick, t } from './lang.ts'

/** Weeks remaining until a goal date, or null for open-ended goals. */
export const weeksToGoal = (goal: Goal, today: string): number | null =>
  goal.targetDate ? Math.ceil(diffDays(today, goal.targetDate) / 7) : null

/**
 * A main goal comes before a side goal whatever the dates: a B race three weeks
 * out must not take the season over from the A race in spring. Between goals of
 * the same priority, the nearer one leads.
 */
const byPriorityThenUrgency = (today: string) => (left: Goal, right: Goal): number => {
  if (left.priority !== right.priority) return left.priority === 'A' ? -1 : 1
  const leftWeeks = weeksToGoal(left, today) ?? Number.POSITIVE_INFINITY
  const rightWeeks = weeksToGoal(right, today) ?? Number.POSITIVE_INFINITY
  return leftWeeks - rightWeeks
}

/**
 * Goals whose date has passed no longer steer the plan. Counted in days: the
 * rounded weeks of the six days after a goal read as "0 weeks left", which kept
 * a finished goal in its taper for almost another week.
 */
const active = (goals: readonly Goal[], today: string): readonly Goal[] =>
  goals.filter((goal) => goal.targetDate === undefined || diffDays(today, goal.targetDate) >= 0)

export const primaryGoal = (goals: readonly Goal[], today: string): Goal | undefined =>
  [...active(goals, today)].sort(byPriorityThenUrgency(today))[0]

export const goalForSport = (
  goals: readonly Goal[],
  sport: Sport,
  today: string,
): Goal | undefined =>
  [...active(goals, today)].filter((goal) => goal.sport === sport).sort(byPriorityThenUrgency(today))[0]

/** Absent means yes: a goal is tapered for unless the athlete says otherwise. */
export const tapers = (goal: Goal): boolean => goal.taper !== false

const TAPER_WEEKS = 1

/**
 * A taper is for the whole body, not for one sport: the legs that run on Sunday
 * are the legs that ride on Friday. So the week before any main goal that is
 * tapered for is a taper week in every sport.
 */
const taperingFor = (goals: readonly Goal[], today: string): Goal | undefined =>
  active(goals, today).find((goal) => {
    if (goal.priority !== 'A' || !tapers(goal)) return false
    const weeks = weeksToGoal(goal, today)
    return weeks !== null && weeks <= TAPER_WEEKS
  })

/** Whole calendar weeks between the week the plan started and the week of `today`. */
const weekIndex = (planStart: string, today: string): number =>
  weeksBetween(startOfWeek(planStart), startOfWeek(today))

/**
 * Every fourth week is a recovery week, counted in calendar weeks from the week
 * the plan started.
 *
 * Counting from the start *date* would run each block from that weekday to the
 * same weekday four weeks later, so a plan started on a Thursday put its
 * recovery block on Thursday to Wednesday: the end of one week and the start of
 * the next, which reads as two recovery weeks in a row. It also matched no other
 * week in this app — the hard session budget, the weekly load and the engine's
 * own simulation all run Monday to Sunday.
 */
export const isRecoveryWeek = (planStart: string, today: string): boolean =>
  weekIndex(planStart, today) % 4 === 3

const datedPhase = (weeksLeft: number, taper: boolean): Phase => {
  if (weeksLeft <= TAPER_WEEKS) return taper ? 'TAPER' : 'SPECIFIC'
  if (weeksLeft <= 4) return 'SPECIFIC'
  if (weeksLeft <= 10) return 'BUILD'
  return 'BASE'
}

/** Open-ended goals cycle through two four-week blocks: base, then build. */
const openEndedPhase = (planStart: string, today: string): Phase => {
  const block = Math.floor(weekIndex(planStart, today) / 4)
  return block % 2 === 0 ? 'BASE' : 'BUILD'
}

/**
 * The phase the block is in, before the recovery week is laid over it.
 *
 * A main goal is what a sport is periodised towards. A side goal is raced out of
 * training: it gets its race day and, with taper, the easy days before it
 * (coach/goal-race.ts), but takes no block from a main goal in the same sport.
 * Only where a sport has nothing but side goals does the nearest one set its
 * blocks — still without a taper week of its own. goalForSport already puts
 * main goals first, so it is the goal that steers.
 */
const basePhaseForSport = (config: CoachConfig, sport: Sport, today: string): Phase => {
  if (taperingFor(config.goals, today)) return 'TAPER'
  const goal = goalForSport(config.goals, sport, today)
  const weeksLeft = goal ? weeksToGoal(goal, today) : null
  return goal === undefined || weeksLeft === null
    ? openEndedPhase(config.planStart, today)
    : datedPhase(weeksLeft, goal.priority === 'A' && tapers(goal))
}

export const phaseForSport = (config: CoachConfig, sport: Sport, today: string): Phase => {
  const phase = basePhaseForSport(config, sport, today)
  if (phase === 'TAPER') return phase
  return isRecoveryWeek(config.planStart, today) ? 'RECOVERY' : phase
}

/**
 * The weeks from here to the goal, as the calendar already decides them. Nothing
 * in here depends on how training goes: this is the one view that does not move
 * when a session is missed, which is what makes it worth showing.
 */
export const seasonBand = (
  config: CoachConfig,
  today: string,
  maxWeeks = 16,
): readonly SeasonWeek[] => {
  // The band runs to the main goal; a side goal only where there is no main one.
  const goal =
    primaryGoal(
      config.goals.filter((entry) => entry.priority === 'A'),
      today,
    ) ?? primaryGoal(config.goals, today)
  const sport = goal?.sport ?? config.profile.sports[0]?.sport ?? 'Ride'
  const thisWeek = startOfWeek(today)
  const weeksToTarget = goal?.targetDate
    ? weeksBetween(thisWeek, startOfWeek(goal.targetDate)) + 1
    : maxWeeks
  const weeks = Math.max(1, Math.min(weeksToTarget, maxWeeks))

  return Array.from({ length: weeks }, (_unused, index) => {
    const start = addDays(thisWeek, index * 7)
    const phase = basePhaseForSport(config, sport, start)
    return {
      start,
      phase,
      // Tapering outranks the recovery week, exactly as it does in phaseForSport —
      // otherwise the goal week would read as a reduced week as well.
      recovery: phase !== 'TAPER' && isRecoveryWeek(config.planStart, start),
      current: index === 0,
      goalWeek: goal?.targetDate !== undefined && startOfWeek(goal.targetDate) === start,
    }
  })
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
  const volumeBudget = Math.max(1, profile.weeklySessions.max - 1)
  return Math.min(phaseBudget, volumeBudget)
}

export const PHASE_LABELS: Readonly<Record<Phase, string>> = perLang(() => ({
  BASE: pick('Grundlage', 'Base'),
  BUILD: t('Aufbau'),
  SPECIFIC: t('Spezifisch'),
  TAPER: t('Tapering'),
  RECOVERY: t('Erholungswoche'),
}))
