import type { IntervalsSource } from '../source.ts'
import { SourceReadOnlyError } from '../source.ts'
import { IntervalsError } from '../intervals.ts'
import type { DemoData } from './fixtures.ts'
import { DEMO_ATHLETE_ID, generateDemo, intervalsOf, streamsOf } from './fixtures.ts'

const NOT_SENT = 'Demo mit Beispieldaten: hier wird nichts an intervals.icu gesendet.'

const within = <T extends { readonly date: string }>(items: readonly T[], oldest: string, newest: string): readonly T[] =>
  items.filter((item) => item.date >= oldest && item.date <= newest)

/**
 * The demo's stand-in for intervals.icu. Reads come from the synthetic fixtures;
 * there is no network anywhere in here, and no credential to hold. Writes are
 * refused with a message the athlete can read, so the button they tapped
 * explains itself instead of pretending something happened.
 */
export const fixtureSource = (data: DemoData): IntervalsSource => {
  const session = (activityId: string) => {
    const found = data.sessions.get(activityId)
    // As intervals.icu would answer an unknown activity.
    if (!found) throw new IntervalsError('intervals.icu 404: Anfrage abgelehnt.', 404)
    return found
  }
  const source: IntervalsSource = {
    athleteId: DEMO_ATHLETE_ID,
    canRewriteStreams: false,
    activities: async (oldest, newest) => within(data.activities, oldest, newest),
    wellness: async (oldest, newest) => within(data.wellness, oldest, newest),
    events: async (oldest, newest) => within(data.events, oldest, newest),
    activity: async (activityId) => session(activityId).activity,
    intervals: async (activityId) => intervalsOf(session(activityId)),
    workIntervals: async (activityId) =>
      intervalsOf(session(activityId))
        .filter((interval) => interval.kind === 'work')
        .map(({ seconds, averageWatts, averageSpeedMps }) => ({ seconds, averageWatts, averageSpeedMps })),
    streams: async (activityId) => streamsOf(session(activityId)),
    sportSettings: async () => data.sportSettings,
    destinations: async () => data.destinations,
    applyDestinations: async () => {
      throw new SourceReadOnlyError(NOT_SENT)
    },
    createWorkout: async () => {
      throw new SourceReadOnlyError(NOT_SENT)
    },
    updateThreshold: async () => {
      throw new SourceReadOnlyError(NOT_SENT)
    },
    replaceHeartRate: async () => {
      throw new SourceReadOnlyError(NOT_SENT)
    },
    addActivityNote: async () => {
      throw new SourceReadOnlyError(NOT_SENT)
    },
    // Nothing is cached, so asking again is asking the same fixtures.
    fresh: () => source,
  }
  return source
}

/** The fixtures for one day, built once per isolate and day — generating them takes a few milliseconds. */
let cached: DemoData | null = null

export const demoData = (today: string): DemoData => {
  if (cached?.today !== today) cached = generateDemo(today)
  return cached
}
