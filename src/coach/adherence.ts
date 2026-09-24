import type { Activity, AdherenceDay, AdherenceStatus, DayProposal, PlannedEvent } from './types.ts'
import type { Completion } from './progression.ts'
import { addDays, weekdayDe } from './dates.ts'
import { LIBRARY, findTemplate } from './library.ts'
import { ZRL_TEMPLATE_ID, isZrlRace } from './zrl.ts'

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
  planned: readonly string[],
  trained: readonly Activity[],
  paired: Activity | null,
  today: boolean,
): AdherenceStatus => {
  if (paired) return 'done'
  if (trained.some(isZrlRace)) return 'race'
  if (planned.length > 0 && trained.length === 0) return today ? 'open' : 'missed'
  if (planned.length > 0) return 'switched'
  return trained.length > 0 ? 'unplanned' : 'rest'
}

const dayFor = (
  date: string,
  events: readonly PlannedEvent[],
  activities: readonly Activity[],
  proposals: readonly DayProposal[],
  completions: readonly Completion[],
  today: string,
): AdherenceDay => {
  const pushed = events.filter((event) => event.date === date && isOurs(event))
  const recommended = proposals.find((entry) => entry.date === date)?.recommended
  const recommendedName =
    recommended === ZRL_TEMPLATE_ID
      ? 'Zwift Racing League'
      : recommended
        ? findTemplate(recommended)?.name
        : undefined
  const names = [...new Set(pushed.map((event) => event.name))]
  // A shortened push is named "<template> (45 min)", which already is the recommendation.
  const alreadyNamed = recommendedName && names.some((name) => name.startsWith(recommendedName))
  const planned = recommendedName && !alreadyNamed ? [...names, recommendedName] : names
  const trained = activities.filter((activity) => activity.date === date && activity.load > 0)

  const paired =
    trained.find(
      (activity) =>
        activity.pairedEventId !== null &&
        pushed.some((event) => event.id === activity.pairedEventId),
    ) ??
    trained.find((activity) => pushed.some((event) => event.pairedActivityId === activity.id)) ??
    trained.find((activity) =>
      completions.some(
        (completion) => completion.activityId === activity.id && completion.date === date,
      ),
    ) ??
    null

  const completed = paired ?? trained.find(isZrlRace) ?? heaviest(trained)

  return {
    date,
    weekday: weekdayDe(date),
    status: classify(planned, trained, paired, date === today),
    planned,
    completed: completed?.name || (completed ? 'Einheit ohne Namen' : null),
    completedSport: completed?.sport ?? null,
    compliance: paired?.compliance ?? null,
    load: Math.round(trained.reduce((sum, activity) => sum + activity.load, 0)),
    activityId: completed?.id ?? null,
    templateId: !completed
      ? null
      : isZrlRace(completed)
        ? ZRL_TEMPLATE_ID
        : (completions.find((completion) => completion.activityId === completed.id)?.templateId ?? null),
  }
}

/** The days leading up to and including `today`, oldest first. */
export const buildHistory = (
  events: readonly PlannedEvent[],
  activities: readonly Activity[],
  today: string,
  days = 7,
  proposals: readonly DayProposal[] = [],
  completions: readonly Completion[] = [],
): readonly AdherenceDay[] =>
  Array.from({ length: days }, (_unused, index) => addDays(today, index - (days - 1))).map((date) =>
    dayFor(date, events, activities, proposals, completions, today),
  )
