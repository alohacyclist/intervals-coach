import type { Activity, AthleteProfile, FitnessCeiling, Phase, TrainingBreak } from './types.ts'
import { addDays } from './dates.ts'
import { CTL_DAYS, dailyLoads, PLATEAU_GAIN } from './fitness.ts'

/**
 * Where fitness is heading at the load the athlete trains now.
 *
 * Fitness (CTL) is an average of daily load over six weeks. Held at the same
 * load, it does not keep rising: it closes in on that load and stops there. So
 * the load of the last weeks already says where the curve will flatten — weeks
 * before the curve itself shows it. The plan only notices a plateau once four
 * weeks brought less than PLATEAU_GAIN; by then a month is gone. This tells the
 * athlete in advance that the same training will not bring more, and how much
 * more time it takes to keep improving.
 */

/** One 3:1 cycle, so a recovery week inside it is part of the level, not a dip below it. */
export const CEILING_WINDOW_DAYS = 28
/** How far ahead the gain is read: the same four weeks the plan reads its plateau over. */
const AHEAD_DAYS = 28
/** Share of the gap to the level that four weeks close: 1 − (1 − 1/42)^28, about a half. */
const CLOSED_AHEAD = 1 - (1 - 1 / CTL_DAYS) ** AHEAD_DAYS
/**
 * Load an hour of easy endurance brings: intensity factor 0.7, squared, times
 * 100. The extra time is asked as easy volume, so it is counted at that rate and
 * not at the athlete's average, which interval sessions push far higher.
 */
export const EASY_LOAD_PER_HOUR = 50
/** The usual step for more training: a tenth more load. */
const STEP = 0.1
/** Fewer sessions than one a week in the window leave no level to read. */
const MIN_SESSIONS = 4
/** Extra time is named in quarter hours, and never less than half an hour a week. */
const MINUTES_STEP = 15
const MIN_MORE_MINUTES = 30

type Context = {
  readonly profile: AthleteProfile
  readonly breaks: readonly TrainingBreak[]
  /** The phase this week is in; a recovery week and a taper flatten the curve on purpose. */
  readonly phase: Phase
}

const round = (value: number): number => Math.round(value * 10) / 10

export const fitnessCeiling = (
  activities: readonly Activity[],
  today: string,
  ctl: number,
  { profile, breaks, phase }: Context,
): FitnessCeiling | null => {
  if (phase === 'RECOVERY' || phase === 'TAPER') return null
  const from = addDays(today, -(CEILING_WINDOW_DAYS - 1))
  // A break inside the window explains a low level on its own, and the plan already names it.
  if (breaks.some((entry) => entry.until >= from && entry.from <= today)) return null
  const recent = activities.filter((entry) => entry.date >= from && entry.date <= today && entry.load > 0)
  if (recent.length < MIN_SESSIONS) return null

  const loads = dailyLoads(recent, from, today)
  const level = loads.reduce((sum, load) => sum + load, 0) / CEILING_WINDOW_DAYS
  const ahead = (level - ctl) * CLOSED_AHEAD
  if (ahead >= PLATEAU_GAIN) return null

  // Enough to lift the level by a tenth, and at least enough to gain a plateau's worth again.
  const target = Math.max(level * (1 + STEP), ctl + PLATEAU_GAIN / CLOSED_AHEAD)
  const extraPerWeek = (target - level) * 7
  const moreMinutes = Math.max(
    MIN_MORE_MINUTES,
    Math.ceil(((extraPerWeek / EASY_LOAD_PER_HOUR) * 60) / MINUTES_STEP) * MINUTES_STEP,
  )
  const hoursPerWeek = recent.reduce((sum, entry) => sum + entry.movingTimeSec, 0) / 3600 / (CEILING_WINDOW_DAYS / 7)
  const budgetHours = (profile.weeklySessions.max * profile.sessionMinutes.max) / 60

  return {
    kind: ahead <= -PLATEAU_GAIN / 2 ? 'falling' : 'flat',
    level: round(level),
    ahead: round(ahead),
    hoursPerWeek: round(hoursPerWeek),
    moreMinutes,
    raised: round(target),
    budgetHours: round(budgetHours),
    // The budget is what the athlete allows at most: sessions a week times the longest session.
    budgetFull: hoursPerWeek + moreMinutes / 60 > budgetHours,
  }
}
