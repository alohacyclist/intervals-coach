import type { Feasibility, Goal, GoalOption, SportStanding } from './types.ts'
import { addDays, diffDays, formatClock } from './dates.ts'
import { typicalGainPerWeek } from './feasibility.ts'

/**
 * A goal that is not going to happen as set gets two ways out, both worked out
 * from how the athlete has actually been improving: a target that the date
 * allows, or a date that the target needs. The athlete picks; the plan follows.
 */

/** A short upswing does not last: no forecast leans on more than twice the typical gain. */
const MOST_TYPICAL_MULTIPLE = 2
/** Further out than this a date is a wish, not a plan. */
const LONGEST_WEEKS = 104
/** Watts are offered in fives and race times in quarter minutes: precise enough to aim at, round enough to remember. */
const WATT_STEP = 5
const SECONDS_STEP = 15

/** Better is up for watts and down for a race time. */
const betterOf = (goal: Goal): 1 | -1 => (goal.kind === 'ftp' ? 1 : -1)

/** Whether the goal as set needs another look: the trend misses it, or no trend says it and the maths does. */
const needsAnotherLook = (goal: Goal, standing: SportStanding | undefined, feasibility: Feasibility | undefined): boolean => {
  if (goal.targetDate === undefined) return true
  // Beyond the best case on its own day: no trend line needed to see it.
  if (standing?.goal?.id === goal.id && standing.forecast?.goalChance === 'out-of-reach') return true
  if (standing?.goal?.id === goal.id && standing.verdict !== null) {
    return standing.verdict === 'late' || standing.verdict === 'stalled'
  }
  return feasibility !== undefined && feasibility.verdict !== 'on-track'
}

/** Rounded towards what is still reachable: watts down, times up. */
const roundTarget = (goal: Goal, value: number): number =>
  goal.kind === 'ftp'
    ? Math.floor(value / WATT_STEP) * WATT_STEP
    : Math.ceil(value / SECONDS_STEP) * SECONDS_STEP

/**
 * The label follows the target where it names it: "FTP 300 W" becomes "FTP 290 W",
 * "10 km unter 36:00" becomes "10 km unter 36:30". A name without the number stays as it is.
 */
export const relabel = (goal: Goal, targetValue: number): string => {
  if (goal.kind === 'ftp') {
    return goal.label.replace(new RegExp(`(?<!\\d)${goal.targetValue}(?!\\d)`), String(targetValue))
  }
  const clock = formatClock(goal.targetValue)
  if (goal.label.includes(clock)) return goal.label.replace(clock, formatClock(targetValue))
  // "sub 36" names whole minutes.
  if (goal.targetValue % 60 === 0) {
    return goal.label.replace(new RegExp(`(?<![\\d:])${goal.targetValue / 60}(?![\\d:])`), formatClock(targetValue))
  }
  return goal.label
}

const optionFor = (
  goal: Goal,
  standing: SportStanding | undefined,
  feasibility: Feasibility | undefined,
  today: string,
): GoalOption | null => {
  if (!needsAnotherLook(goal, standing, feasibility)) return null
  const own = standing?.goal?.id === goal.id ? standing : undefined
  const current = own?.current ?? feasibility?.currentValue ?? goal.currentValue
  const better = betterOf(goal)
  const missing = better * (goal.targetValue - current)
  if (missing <= 0) return null

  const typical = typicalGainPerWeek(goal, current)
  const trend = own?.trendPerWeek === null || own?.trendPerWeek === undefined ? null : better * own.trendPerWeek
  const fromTrend = trend !== null && trend > 0
  const perWeek = fromTrend ? Math.min(trend, typical * MOST_TYPICAL_MULTIPLE) : typical

  const weeksToTarget = Math.ceil(missing / perWeek)
  const reachedOn = weeksToTarget <= LONGEST_WEEKS ? addDays(today, weeksToTarget * 7) : null
  // The date already set is no way out.
  const date = reachedOn === goal.targetDate ? null : reachedOn

  const weeksToDate = goal.targetDate === undefined ? null : diffDays(today, goal.targetDate) / 7
  // The forecast for the goal's own day already weighs trend, taper and endurance: its likely value is the target.
  const forecast = own?.forecast && own.forecast.date === goal.targetDate ? own.forecast.likely : null
  const reachable =
    weeksToDate === null || weeksToDate <= 0
      ? null
      : roundTarget(goal, forecast ?? current + better * perWeek * weeksToDate)
  // Only a target that is still a step forward, and short of the one set: a way out never raises the bar.
  const value =
    reachable !== null && better * (reachable - current) > 0 && better * (goal.targetValue - reachable) > 0
      ? { targetValue: reachable, label: relabel(goal, reachable) }
      : null

  if (value === null && date === null) return null
  return {
    goalId: goal.id,
    basis: forecast !== null && value !== null ? 'forecast' : fromTrend ? 'trend' : 'typical',
    perWeek: Math.round(perWeek * 10) / 10,
    current: Math.round(current),
    value,
    date: date === null ? null : { targetDate: date },
  }
}

export const goalOptions = (
  goals: readonly Goal[],
  standing: readonly SportStanding[],
  feasibility: readonly Feasibility[],
  today: string,
): readonly GoalOption[] =>
  goals.flatMap((goal) => {
    const option = optionFor(
      goal,
      standing.find((entry) => entry.goal?.id === goal.id),
      feasibility.find((entry) => entry.goalId === goal.id),
      today,
    )
    return option === null ? [] : [option]
  })
