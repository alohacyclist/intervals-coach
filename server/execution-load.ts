import type { Activity, AthleteProfile, Execution, WorkoutTemplate } from '../src/coach/types.ts'
import { compareExecution, plannedBlocks } from '../src/coach/execution.ts'
import { scheduledFrom } from '../src/coach/progression.ts'
import { defaultThreshold, thresholdFor } from '../src/coach/thresholds.ts'
import { buildTrace } from '../src/coach/trace.ts'
import type { IntervalsAuth } from './intervals.ts'
import { fetchActivity, fetchEvents, fetchIntervals, fetchStreams } from './intervals.ts'

export type LoadedExecution = { readonly execution: Execution; readonly activity: Activity }

/**
 * One completed session set against the template it fulfilled. The card asks for
 * it when the athlete looks, the Strava sync when a session comes in — both need
 * the same four calls to intervals.icu and the same answer.
 */
export const loadExecution = async (
  auth: IntervalsAuth,
  profile: AthleteProfile,
  activityId: string,
  template: WorkoutTemplate,
  date: string | null,
): Promise<LoadedExecution> => {
  const threshold = thresholdFor(profile, template.sport) ?? defaultThreshold(template.sport)
  const [activity, intervals, events, trace] = await Promise.all([
    fetchActivity(auth, activityId),
    fetchIntervals(auth, activityId),
    date === null ? Promise.resolve([]) : fetchEvents(auth, date, date),
    // The drawing is extra: a missing stream must not take the comparison down with it.
    fetchStreams(auth, activityId).then(
      (streams) => buildTrace(streams, threshold),
      () => null,
    ),
  ])
  const pushed = scheduledFrom(events).find((entry) => entry.templateId === template.id)?.minutes ?? null

  return {
    activity,
    execution: compareExecution({
      activityId,
      sport: template.sport,
      template,
      blocks: plannedBlocks(template, threshold, pushed),
      threshold,
      intervals,
      load: activity.load,
      movingSeconds: activity.movingTimeSec,
      compliance: activity.compliance,
      trace,
    }),
  }
}
