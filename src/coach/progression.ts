import type { Activity, PlannedEvent, ScheduledWorkout } from './types.ts'
import { LIBRARY, findTemplate } from './library.ts'

/** Without readable intervals: below this the session was not executed closely enough to earn the next level. */
const GOOD_COMPLIANCE = 75
/** Sessions per family and level whose intervals are read; older ones keep the coarser rule. */
const READS_PER_LEVEL = 2
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
  /**
   * Whether every work interval of the full session was ridden to length and at
   * least in its target band. Read from the intervals where they can be, and then
   * the only thing that decides the next level: too hard moves the threshold and
   * too long the load, neither holds the level back. Absent when not read.
   */
  readonly held?: boolean | null
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
 * Whether a session earns the next level. Its intervals decide where they could
 * be read. Without them the coarser signs stand in: the full version, and
 * intervals.icu's compliance or a recognition of the session's own work.
 */
const cleared = (completion: Completion): boolean =>
  completion.held != null
    ? completion.held
    : completion.variant === 'full' &&
      (completion.compliance !== null
        ? completion.compliance >= GOOD_COMPLIANCE
        : completion.evidence === 'exact')

/**
 * The level an athlete has earned in one progression family: one above the
 * highest level they have completed cleanly, capped by what exists. Doing half
 * the intervals proves the athlete can hold the pace, not that they can hold it
 * for the whole session.
 */
export const levelFor = (family: string, completions: readonly Completion[]): number => {
  const levels = levelsIn(family)
  const top = levels[levels.length - 1] ?? 1
  const clearedLevels = completions
    .filter(cleared)
    .map((completion) => LIBRARY.find((template) => template.id === completion.templateId))
    .filter((template) => template?.family === family)
    .map((template) => template?.level ?? 1)

  return clearedLevels.length === 0 ? (levels[0] ?? 1) : Math.min(Math.max(...clearedLevels) + 1, top)
}

/**
 * The sessions worth reading interval by interval for the levels: the newest few
 * of every family and level. "Similar" only matched the hardness, not this
 * template's intervals, so there is nothing to hold them against.
 */
export const toJudge = (completions: readonly Completion[]): readonly Completion[] => {
  const newestFirst = [...completions].sort((left, right) => right.date.localeCompare(left.date))
  const taken = new Map<string, number>()
  return newestFirst.filter((completion) => {
    const template = LIBRARY.find((entry) => entry.id === completion.templateId)
    if (template?.family === undefined || completion.evidence === 'similar') return false
    const key = `${template.family}:${template.level ?? 1}`
    const count = taken.get(key) ?? 0
    if (count >= READS_PER_LEVEL) return false
    taken.set(key, count + 1)
    return true
  })
}

/** The interval verdicts, by activity id, laid onto the sessions they belong to. */
export const withHeld = (
  completions: readonly Completion[],
  held: ReadonlyMap<string, boolean>,
): readonly Completion[] =>
  completions.map((completion) =>
    held.has(completion.activityId) ? { ...completion, held: held.get(completion.activityId) } : completion,
  )

/** Level ceilings per family, so the engine can filter candidates in one pass. */
export const levelCeilings = (completions: readonly Completion[]): Readonly<Record<string, number>> => {
  const families = [...new Set(LIBRARY.map((template) => template.family).filter(Boolean))] as string[]
  return Object.fromEntries(families.map((family) => [family, levelFor(family, completions)]))
}
