import type { Activity, CoachConfig, Intent, PlannedDay, Wellness } from './types.ts'
import type { Completion } from './progression.ts'
import { buildState } from './state.ts'
import { planDays } from './engine.ts'

/**
 * Today's proposal is the one the athlete saw in the morning. Planned from the
 * state before the session, it cannot turn into something else the moment the
 * session syncs — which read as the plan disowning what was just done. The
 * session still counts, from tomorrow on.
 */
export const planFromMorning = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  completions: readonly Completion[],
  config: CoachConfig,
  today: string,
  days: number,
  intent?: Intent,
  raceActivities: readonly Activity[] = activities,
): readonly PlannedDay[] => {
  const earlier = activities.filter((activity) => activity.date < today)
  const doneToday = activities.filter((activity) => activity.date === today)
  const earlierRaces = raceActivities.filter((activity) => activity.date < today)
  return planDays(
    buildState(earlier, wellness, today, earlierRaces),
    config,
    days,
    completions,
    intent,
    doneToday,
  )
}
