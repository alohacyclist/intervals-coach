import type { Activity, AthleteProfile, Execution, WorkoutTemplate } from '../src/coach/types.ts'
import { compareExecution, plannedBlocks } from '../src/coach/execution.ts'
import { scheduledFrom } from '../src/coach/progression.ts'
import { defaultThreshold, thresholdFor } from '../src/coach/thresholds.ts'
import { buildTrace } from '../src/coach/trace.ts'
import { checkHeart, correctedHeartRate, withHeartCheck } from '../src/coach/heart-check.ts'
import { garminDevice } from '../src/coach/attribution.ts'
import { testOutcome } from '../src/coach/test-outcome.ts'
import { sessionFeedback } from '../src/coach/session-outcome.ts'
import type { IntervalsSource } from './source.ts'

export type LoadedExecution = {
  readonly execution: Execution
  readonly activity: Activity
  /** The heart rate with its faulty stretches estimated, sample for sample; null when there is nothing to correct. */
  readonly correctedHeartRate: readonly (number | null)[] | null
}

/**
 * One completed session set against the template it fulfilled. The card asks for
 * it when the athlete looks, the Strava sync when a session comes in — both need
 * the same four calls to intervals.icu and the same answer.
 */
export const loadExecution = async (
  source: IntervalsSource,
  profile: AthleteProfile,
  activityId: string,
  template: WorkoutTemplate,
  date: string | null,
): Promise<LoadedExecution> => {
  const threshold = thresholdFor(profile, template.sport) ?? defaultThreshold(template.sport)
  const [activity, intervals, events, streams] = await Promise.all([
    source.activity(activityId),
    source.intervals(activityId),
    date === null ? Promise.resolve([]) : source.events(date, date),
    // The drawing and the heart check are extra: a missing stream must not take the comparison down with it.
    source.streams(activityId, template.sport).catch(() => null),
  ])
  const pushed = scheduledFrom(events).find((entry) => entry.templateId === template.id)?.minutes ?? null
  const execution: Execution = {
    ...compareExecution({
      activityId,
      sport: template.sport,
      template,
      blocks: plannedBlocks(template, threshold, pushed),
      threshold,
      intervals,
      load: activity.load,
      movingSeconds: activity.movingTimeSec,
      compliance: activity.compliance,
      trace: streams ? buildTrace(streams, threshold) : null,
    }),
    garmin: garminDevice(activity),
    // A test asks what came of it; the answer belongs under the session, not further down the plan.
    test:
      template.measures === 'threshold'
        ? testOutcome(
            template.sport,
            threshold,
            streams,
            intervals
              .filter((interval) => interval.kind === 'work')
              .map(({ seconds, averageWatts, averageSpeedMps }) => ({ seconds, averageWatts, averageSpeedMps })),
          )
        : null,
  }

  const heart = streams ? checkHeart(streams, threshold, profile.maxHr) : null
  const corrected = streams ? correctedHeartRate(streams, heart) : null
  const marked = withHeartCheck(execution, heart)
  // Read after the heart check: a faulty recording says nothing about how the heart held up.
  const checked: Execution = {
    ...marked,
    feedback: sessionFeedback({
      execution: marked,
      template,
      threshold,
      maxHr: profile.maxHr,
      shortened: pushed !== null && pushed < template.minutes,
    }),
  }

  return {
    activity,
    // A personal API key may write activities; the OAuth grant deliberately does not ask to.
    execution:
      checked.heart && corrected && source.canRewriteStreams
        ? { ...checked, heart: { ...checked.heart, writable: true } }
        : checked,
    correctedHeartRate: corrected,
  }
}
