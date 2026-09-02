import type {
  Activity,
  DataIssue,
  Fitness,
  RecentActivity,
  Sport,
  StimulusRecency,
  TrainingState,
  Wellness,
} from './types.ts'
import { ALL_SPORTS } from './types.ts'
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

const daysSinceAny = (activities: readonly Activity[], today: string): number => {
  const ages = activities
    .filter((activity) => activity.load > 0)
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
    if (activity.sport === 'Other' || activity.load <= 0) continue
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

/** Watches auto-log walks and similar. They carry no load and are not training. */
const carriesLoad = (activity: Activity): boolean => activity.load > 0

/**
 * The newest activity worth showing: latest date first, and among several on the
 * same day the one with the highest load, so a stray auto-detected entry never
 * masks the real session.
 */
const newestActivity = (activities: readonly Activity[], today: string): RecentActivity | null => {
  const past = activities.filter((activity) => diffDays(activity.date, today) >= 0)
  const candidates = past.some(carriesLoad) ? past.filter(carriesLoad) : past
  const newest = candidates.reduce<Activity | null>(
    (best, activity) =>
      best === null || activity.date > best.date || (activity.date === best.date && activity.load > best.load)
        ? activity
        : best,
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

/**
 * Strava forbids intervals.icu from serving Strava-sourced activities over its
 * API, so they arrive as empty stubs. Without this check the plan would just
 * show zeroes and look broken.
 */
const SHARE_WORTH_REPORTING = 0.2

const detectDataIssue = (activities: readonly Activity[]): DataIssue | null => {
  const total = activities.length
  if (total === 0) return null
  const blocked = activities.filter(
    (activity) => activity.source === 'STRAVA' && activity.load <= 0,
  ).length
  if (blocked > 0 && blocked / total > SHARE_WORTH_REPORTING) {
    return { kind: 'strava-blocked', affected: blocked, total }
  }
  return activities.every((activity) => activity.load <= 0)
    ? { kind: 'no-load', affected: total, total }
    : null
}

const bySport = (activities: readonly Activity[], today: string): Record<Sport, Fitness> =>
  Object.fromEntries(
    ALL_SPORTS.map((sport) => [sport, computeFitness(activities, today, sport)]),
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
      ALL_SPORTS.map((sport) => [sport, daysSinceHard(activities, today, sport)]),
    ) as Record<Sport, number>,
    hardSessionsLast7: last7.filter(isHardActivity).length,
    hardSessionsThisWeek: thisWeek.filter(isHardActivity).length,
    sessionsThisWeek: thisWeek.filter((activity) => activity.sport !== 'Other').length,
    hardThisWeekBySport: Object.fromEntries(
      ALL_SPORTS.map((sport) => [
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
    loadedActivityCount: activities.filter((activity) => activity.load > 0).length,
    dataIssue: detectDataIssue(activities),
    daysSinceAnySession: daysSinceAny(activities, today),
    strengthSessionsThisWeek: thisWeek.filter((activity) => activity.isStrength).length,
  }
}
