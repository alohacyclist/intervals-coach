import type { Activity, PlannedEvent } from './types.ts'
import { LIBRARY } from './library.ts'

/** Below this the session was not executed closely enough to earn the next level. */
const GOOD_COMPLIANCE = 75
const EXTERNAL_ID_PREFIX = 'coach:'

export type Completion = {
  readonly templateId: string
  readonly date: string
  readonly compliance: number | null
  readonly activityId: string
  readonly variant: 'full' | 'short'
}

/** `coach:<date>:<templateId>[:short]` is written when the app pushes a workout. */
const templateIdOf = (event: PlannedEvent): string | null => {
  if (event.externalId?.startsWith(EXTERNAL_ID_PREFIX) !== true) return null
  const id = event.externalId.split(':')[2]
  return id && id.length > 0 ? id : null
}

const variantOf = (event: PlannedEvent): 'full' | 'short' =>
  event.externalId?.split(':')[3] === 'short' ? 'short' : 'full'

/**
 * Sessions this app proposed that intervals.icu paired with a real activity.
 * Only these can move an athlete up a level — a workout that was planned but
 * skipped proves nothing.
 */
export const completionsFrom = (
  events: readonly PlannedEvent[],
  activities: readonly Activity[],
): readonly Completion[] =>
  events.flatMap((event) => {
    const templateId = templateIdOf(event)
    if (!templateId) return []
    const activity =
      activities.find((candidate) => candidate.pairedEventId === event.id) ??
      activities.find((candidate) => candidate.id === event.pairedActivityId)
    return activity
      ? [
          {
            templateId,
            date: event.date,
            compliance: activity.compliance,
            activityId: activity.id,
            variant: variantOf(event),
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
    .filter((completion) => (completion.compliance ?? 0) >= GOOD_COMPLIANCE)
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
