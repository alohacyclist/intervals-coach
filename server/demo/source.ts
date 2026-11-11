import type { IntervalsSource } from '../source.ts'
import { SourceReadOnlyError } from '../source.ts'
import { IntervalsError } from '../intervals.ts'
import type { DemoData } from './fixtures.ts'
import { DEMO_ATHLETE_ID, generateDemo, intervalsOf, streamsOf } from './fixtures.ts'
import { lang, t } from '../../src/coach/lang.ts'
import type { Lang } from '../../src/coach/lang.ts'

const notSent = (): string => t('Demo mit Beispieldaten: hier wird nichts an intervals.icu gesendet.')

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
    if (!found) throw new IntervalsError(t('intervals.icu 404: Anfrage abgelehnt.'), 404)
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
      throw new SourceReadOnlyError(notSent())
    },
    createWorkout: async () => {
      throw new SourceReadOnlyError(notSent())
    },
    updateThreshold: async () => {
      throw new SourceReadOnlyError(notSent())
    },
    replaceHeartRate: async () => {
      throw new SourceReadOnlyError(notSent())
    },
    addActivityNote: async () => {
      throw new SourceReadOnlyError(notSent())
    },
    // Nothing is cached, so asking again is asking the same fixtures.
    fresh: () => source,
  }
  return source
}

/**
 * The fixtures for one day, built once per isolate, day and language — generating them
 * takes a few milliseconds, and the sessions in them are named in the visitor's language.
 */
const cached: Partial<Record<Lang, DemoData>> = {}

export const demoData = (today: string): DemoData => {
  const language = lang()
  const known = cached[language]
  if (known?.today === today) return known
  const fresh = generateDemo(today)
  cached[language] = fresh
  return fresh
}
