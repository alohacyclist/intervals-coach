import type { ActualInterval } from '../src/coach/execution.ts'
import type { ActivityStreams } from '../src/coach/trace.ts'
import type { Activity, DestinationState, PlannedEvent, Sport, Wellness, WorkoutDestination } from '../src/coach/types.ts'
import type { CalendarEvent, IntervalsAuth, SportSettings, WorkInterval } from './intervals.ts'
import {
  addActivityNote,
  applyDestinations,
  bypassingReads,
  createWorkoutEvent,
  fetchActivities,
  fetchActivity,
  fetchActivityIntervals,
  fetchDestinations,
  fetchEvents,
  fetchIntervals,
  fetchSportSettings,
  fetchStreams,
  fetchWellness,
  replaceHeartRate,
  updateSportThreshold,
} from './intervals.ts'

/**
 * Everything the routes need from a training platform, and nothing about how
 * it is reached. The live implementation talks to intervals.icu; the demo reads
 * synthetic fixtures. The routes cannot tell which one they hold — that is the
 * point: the demo exercises the same code path an athlete does.
 */
export type IntervalsSource = {
  /** Who the data belongs to — a cache key, never sent anywhere by the routes. */
  readonly athleteId: string
  /**
   * Whether recorded streams may be rewritten. Only a personal API key may
   * write activities; OAuth deliberately lacks the scope, and the demo has no
   * upstream to write to.
   */
  readonly canRewriteStreams: boolean

  readonly activities: (oldest: string, newest: string) => Promise<readonly Activity[]>
  readonly wellness: (oldest: string, newest: string) => Promise<readonly Wellness[]>
  readonly events: (oldest: string, newest: string) => Promise<readonly PlannedEvent[]>
  readonly activity: (activityId: string) => Promise<Activity>
  readonly intervals: (activityId: string) => Promise<readonly ActualInterval[]>
  readonly workIntervals: (activityId: string) => Promise<readonly WorkInterval[]>
  readonly streams: (activityId: string, sport: Sport | null) => Promise<ActivityStreams>
  readonly sportSettings: () => Promise<SportSettings>
  readonly destinations: () => Promise<readonly DestinationState[]>

  readonly applyDestinations: (wanted: readonly WorkoutDestination[]) => Promise<readonly DestinationState[]>
  readonly createWorkout: (event: CalendarEvent) => Promise<unknown>
  readonly updateThreshold: (sport: Sport, value: number) => Promise<unknown>
  readonly replaceHeartRate: (activityId: string, heartRate: readonly (number | null)[]) => Promise<void>
  readonly addActivityNote: (activityId: string, content: string) => Promise<void>

  /** The same source asked again rather than answered from a recent read: the refresh button. */
  readonly fresh: () => IntervalsSource
}

/** intervals.icu over HTTP — a thin seam over the functions in intervals.ts. */
export const httpSource = (auth: IntervalsAuth): IntervalsSource => ({
  athleteId: auth.athleteId,
  canRewriteStreams: auth.kind === 'apiKey',
  activities: (oldest, newest) => fetchActivities(auth, oldest, newest),
  wellness: (oldest, newest) => fetchWellness(auth, oldest, newest),
  events: (oldest, newest) => fetchEvents(auth, oldest, newest),
  activity: (activityId) => fetchActivity(auth, activityId),
  intervals: (activityId) => fetchIntervals(auth, activityId),
  workIntervals: (activityId) => fetchActivityIntervals(auth, activityId),
  streams: (activityId, sport) => fetchStreams(auth, activityId, sport),
  sportSettings: () => fetchSportSettings(auth),
  destinations: () => fetchDestinations(auth),
  applyDestinations: (wanted) => applyDestinations(auth, wanted),
  createWorkout: (event) => createWorkoutEvent(auth, event),
  updateThreshold: (sport, value) => updateSportThreshold(auth, sport, value),
  replaceHeartRate: (activityId, heartRate) => replaceHeartRate(auth, activityId, heartRate),
  addActivityNote: (activityId, content) => addActivityNote(auth, activityId, content),
  fresh: () => httpSource(bypassingReads(auth)),
})
