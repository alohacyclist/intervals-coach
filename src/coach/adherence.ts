import type { Activity, AdherenceDay, AdherenceStatus, PlannedEvent } from './types.ts'
import { addDays, weekdayDe } from './dates.ts'
import { LIBRARY } from './library.ts'

const EXTERNAL_ID_PREFIX = 'coach:'

/**
 * Events this app proposed. Pushes made before the external id existed are
 * recognised by their workout name, which comes straight from the library.
 */
export const isOurs = (event: PlannedEvent): boolean =>
  event.externalId?.startsWith(EXTERNAL_ID_PREFIX) === true ||
  LIBRARY.some((template) => template.name === event.name)

const heaviest = (activities: readonly Activity[]): Activity | null =>
  activities.reduce<Activity | null>(
    (best, activity) => (best === null || activity.load > best.load ? activity : best),
    null,
  )

const classify = (
  planned: readonly PlannedEvent[],
  trained: readonly Activity[],
  paired: Activity | null,
): AdherenceStatus => {
  if (paired) return 'done'
  if (planned.length > 0) return trained.length > 0 ? 'switched' : 'missed'
  return trained.length > 0 ? 'unplanned' : 'rest'
}

const dayFor = (
  date: string,
  events: readonly PlannedEvent[],
  activities: readonly Activity[],
): AdherenceDay => {
  const planned = events.filter((event) => event.date === date && isOurs(event))
  const trained = activities.filter((activity) => activity.date === date && activity.load > 0)

  const paired =
    trained.find(
      (activity) =>
        activity.pairedEventId !== null &&
        planned.some((event) => event.id === activity.pairedEventId),
    ) ??
    trained.find((activity) => planned.some((event) => event.pairedActivityId === activity.id)) ??
    null

  const completed = paired ?? heaviest(trained)

  return {
    date,
    weekday: weekdayDe(date),
    status: classify(planned, trained, paired),
    planned: planned.map((event) => event.name),
    completed: completed?.name || (completed ? 'Einheit ohne Namen' : null),
    completedSport: completed?.sport ?? null,
    compliance: paired?.compliance ?? null,
    load: Math.round(trained.reduce((sum, activity) => sum + activity.load, 0)),
  }
}

/** The days leading up to and including `today`, oldest first. */
export const buildHistory = (
  events: readonly PlannedEvent[],
  activities: readonly Activity[],
  today: string,
  days = 7,
): readonly AdherenceDay[] =>
  Array.from({ length: days }, (_unused, index) => addDays(today, index - (days - 1))).map((date) =>
    dayFor(date, events, activities),
  )
