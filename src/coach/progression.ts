import type { Activity, PlannedEvent, ScheduledWorkout } from './types.ts'
import { LIBRARY, findTemplate } from './library.ts'

/** Below this the session was not executed closely enough to earn the next level. */
const GOOD_COMPLIANCE = 75
const EXTERNAL_ID_PREFIX = 'coach:'

export type Completion = {
  readonly templateId: string
  readonly date: string
  readonly compliance: number | null
  readonly activityId: string
  readonly variant: 'full' | 'short'
  /**
   * How it is known: paired on the calendar, or recognised from the activity —
   * `exact` when it delivered the proposal's own stimulus, `similar` when it only
   * came close enough to call the day done.
   */
  readonly evidence: 'calendar' | 'exact' | 'similar'
}

type Pushed = {
  readonly templateId: string
  readonly minutes: number | null
  readonly variant: 'full' | 'short'
}

/**
 * `coach:<date>:<templateId>:<minutes>` is written when the app pushes a workout.
 * Older pushes end in `:short` or nothing, which says less about the duration.
 */
const pushedOf = (event: PlannedEvent): Pushed | null => {
  if (event.externalId?.startsWith(EXTERNAL_ID_PREFIX) !== true) return null
  const [, , templateId, suffix] = event.externalId.split(':')
  if (!templateId) return null
  if (suffix === 'short') return { templateId, minutes: null, variant: 'short' }
  const full = findTemplate(templateId)?.minutes ?? null
  const pushed = Number(suffix)
  const minutes = suffix !== undefined && Number.isFinite(pushed) && pushed > 0 ? pushed : full
  const variant = minutes !== null && full !== null && minutes < full ? 'short' : 'full'
  return { templateId, minutes, variant }
}

/** Every version of a proposal already sent to the calendar, by its duration. */
export const scheduledFrom = (events: readonly PlannedEvent[]): readonly ScheduledWorkout[] =>
  events.flatMap((event) => {
    const pushed = pushedOf(event)
    return pushed?.minutes != null
      ? [{ date: event.date, templateId: pushed.templateId, minutes: pushed.minutes }]
      : []
  })

/**
 * Pushed sessions that intervals.icu paired with a real activity. A workout that
 * was planned but skipped proves nothing.
 */
export const completionsFrom = (
  events: readonly PlannedEvent[],
  activities: readonly Activity[],
): readonly Completion[] =>
  events.flatMap((event) => {
    const pushed = pushedOf(event)
    if (!pushed) return []
    const activity =
      activities.find((candidate) => candidate.pairedEventId === event.id) ??
      activities.find((candidate) => candidate.id === event.pairedActivityId)
    return activity
      ? [
          {
            templateId: pushed.templateId,
            date: event.date,
            compliance: activity.compliance,
            activityId: activity.id,
            variant: pushed.variant,
            evidence: 'calendar' as const,
          },
        ]
      : []
  })

const levelsIn = (family: string): readonly number[] =>
  LIBRARY.filter((template) => template.family === family)
    .map((template) => template.level ?? 1)
    .sort((left, right) => left - right)

/**
 * The level an athlete has earned in one progression family: one above the
 * highest level they have completed closely enough, capped by what exists.
 * Short versions do not count — doing half the intervals proves the athlete
 * can hold the pace, not that they can hold it for the whole session.
 */
export const levelFor = (family: string, completions: readonly Completion[]): number => {
  const levels = levelsIn(family)
  const top = levels[levels.length - 1] ?? 1
  const cleared = completions
    .filter((completion) => completion.variant === 'full')
    .filter((completion) =>
      completion.compliance !== null
        ? completion.compliance >= GOOD_COMPLIANCE
        : completion.evidence === 'exact',
    )
    .map((completion) => LIBRARY.find((template) => template.id === completion.templateId))
    .filter((template) => template?.family === family)
    .map((template) => template?.level ?? 1)

  return cleared.length === 0 ? (levels[0] ?? 1) : Math.min(Math.max(...cleared) + 1, top)
}

/** Level ceilings per family, so the engine can filter candidates in one pass. */
export const levelCeilings = (completions: readonly Completion[]): Readonly<Record<string, number>> => {
  const families = [...new Set(LIBRARY.map((template) => template.family).filter(Boolean))] as string[]
  return Object.fromEntries(families.map((family) => [family, levelFor(family, completions)]))
}
