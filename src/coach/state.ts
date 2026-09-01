import type {
  Activity,
  Fitness,
  RecentActivity,
  Sport,
  StimulusRecency,
  TrainingState,
  Wellness,
} from './types.ts'
import { SPORTS } from './types.ts'
import { diffDays, startOfWeek } from './dates.ts'
import { computeFitness, inferStimulus, isHardActivity, rampRate } from './fitness.ts'
import { computeReadiness } from './readiness.ts'

const NEVER = 99

const daysSinceHard = (activities: readonly Activity[], today: string, sport: Sport): number => {
  const ages = activities
    .filter((activity) => activity.sport === sport && isHardActivity(activity))
    .map((activity) => diffDays(activity.date, today))
    .filter((age) => age >= 0)
  return ages.length === 0 ? NEVER : Math.min(...ages)
}

/** Most recent occurrence of each stimulus per sport, used to rotate the training focus. */
export const stimulusRecency = (
  activities: readonly Activity[],
  today: string,
): readonly StimulusRecency[] => {
  const freshest = new Map<string, StimulusRecency>()
  for (const activity of activities) {
    if (activity.sport === 'Other') continue
    const daysAgo = diffDays(activity.date, today)
    if (daysAgo < 0) continue
    const stimulus = inferStimulus(activity)
    const key = `${activity.sport}:${stimulus}`
    const existing = freshest.get(key)
    if (!existing || daysAgo < existing.daysAgo) {
      freshest.set(key, { sport: activity.sport, stimulus, daysAgo })
    }
  }
  return [...freshest.values()]
}

const newestActivity = (activities: readonly Activity[], today: string): RecentActivity | null => {
  const past = activities.filter((activity) => diffDays(activity.date, today) >= 0)
  const newest = past.reduce<Activity | null>(
    (best, activity) => (best === null || activity.date > best.date ? activity : best),
    null,
  )
  return newest
    ? {
        date: newest.date,
        name: newest.name,
        sport: newest.sport,
        load: newest.load,
        daysAgo: diffDays(newest.date, today),
      }
    : null
}

const bySport = (activities: readonly Activity[], today: string): Record<Sport, Fitness> =>
  Object.fromEntries(
    SPORTS.map((sport) => [sport, computeFitness(activities, today, sport)]),
  ) as Record<Sport, Fitness>

export const buildState = (
  activities: readonly Activity[],
  wellness: readonly Wellness[],
  today: string,
): TrainingState => {
  const overall = computeFitness(activities, today)
  const last7 = activities.filter((activity) => {
    const age = diffDays(activity.date, today)
    return age >= 0 && age < 7
  })
  const weekStart = startOfWeek(today)
  const thisWeek = activities.filter(
    (activity) => activity.date >= weekStart && activity.date <= today,
  )

  return {
    today,
    overall,
    bySport: bySport(activities, today),
    daysSinceHard: Object.fromEntries(
      SPORTS.map((sport) => [sport, daysSinceHard(activities, today, sport)]),
    ) as Record<Sport, number>,
    hardSessionsLast7: last7.filter(isHardActivity).length,
    hardSessionsThisWeek: thisWeek.filter(isHardActivity).length,
    sessionsThisWeek: thisWeek.filter((activity) => activity.sport !== 'Other').length,
    hardThisWeekBySport: Object.fromEntries(
      SPORTS.map((sport) => [
        sport,
        thisWeek.filter((activity) => activity.sport === sport && isHardActivity(activity)).length,
      ]),
    ) as Record<Sport, number>,
    recentWorkoutNames: activities
      .filter((activity) => diffDays(activity.date, today) >= 0 && diffDays(activity.date, today) < 10)
      .map((activity) => activity.name),
    loadLast7: Math.round(last7.reduce((sum, activity) => sum + activity.load, 0)),
    rampRate: rampRate(activities, today),
    readiness: computeReadiness(wellness, today, overall.tsb),
    recency: stimulusRecency(activities, today),
    lastActivity: newestActivity(activities, today),
    activityCount: activities.length,
  }
}
