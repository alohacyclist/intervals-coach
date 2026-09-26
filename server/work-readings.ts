import type { IntervalsAuth } from './intervals.ts'
import { fetchIntervals } from './intervals.ts'
import type { Completion } from '../src/coach/progression.ts'
import type { Activity, AthleteProfile, CoachConfig, Sport, ThresholdSuggestion } from '../src/coach/types.ts'
import { compareExecution, comparesBlocks, plannedBlocks } from '../src/coach/execution.ts'
import type { WorkReading } from '../src/coach/efficiency.ts'
import { workReading } from '../src/coach/efficiency.ts'
import { findTemplate } from '../src/coach/library.ts'
import { defaultThreshold, thresholdFor } from '../src/coach/thresholds.ts'
import { diffDays } from '../src/coach/dates.ts'
import { executionSuggestion } from '../src/coach/threshold-drift.ts'
import type { ReadSession } from '../src/coach/threshold-drift.ts'

/** Sessions older than this say little about today's threshold. */
const EXECUTION_DRIFT_DAYS = 28

/**
 * The work intervals of one recognised session, read against the template it
 * fulfilled. One call to intervals.icu — the intervals only, no streams: the
 * drawing is for the card, the reading needs none of it.
 */
export const readWork = async (
  auth: IntervalsAuth,
  profile: AthleteProfile,
  completion: Completion,
  activity: Activity | undefined,
): Promise<WorkReading | null> => {
  const template = findTemplate(completion.templateId)
  if (!template || template.occasion !== undefined) return null
  const threshold = thresholdFor(profile, template.sport) ?? defaultThreshold(template.sport)
  const intervals = await fetchIntervals(auth, completion.activityId).catch(() => null)
  if (!intervals) return null
  return workReading(
    compareExecution({
      activityId: completion.activityId,
      sport: template.sport,
      template,
      // A shortened version keeps its intervals and loses repetitions; pairing by order handles the rest.
      blocks: plannedBlocks(template, threshold, null),
      threshold,
      intervals,
      load: activity?.load ?? 0,
      movingSeconds: activity?.movingTimeSec ?? 0,
      compliance: activity?.compliance ?? null,
      trace: null,
    }),
  )
}

/** Readings for several sessions at once, by activity id; the ones that could not be read are left out. */
export const readWorkMany = async (
  auth: IntervalsAuth,
  profile: AthleteProfile,
  completions: readonly Completion[],
  activities: readonly Activity[],
): Promise<ReadonlyMap<string, WorkReading>> => {
  const unique = [...new Map(completions.map((completion) => [completion.activityId, completion])).values()]
  const read = await Promise.all(
    unique.map(async (completion) => {
      const activity = activities.find((entry) => entry.id === completion.activityId)
      return [completion.activityId, await readWork(auth, profile, completion, activity)] as const
    }),
  )
  return new Map(read.filter((entry): entry is readonly [string, WorkReading] => entry[1] !== null))
}

/** Interval sessions whose targets can be held against the threshold: not tests, races or steady rides. */
const holdsTargets = (completion: Completion): boolean => {
  const template = findTemplate(completion.templateId)
  return (
    template !== undefined &&
    template.occasion === undefined &&
    template.measures !== 'threshold' &&
    comparesBlocks(template) &&
    // "Similar" only matched the hardness, not this template's intervals.
    completion.evidence !== 'similar'
  )
}

/**
 * The last two interval sessions per sport, set against their targets. Four calls
 * to intervals.icu at most for two sports, and only for sessions actually done.
 */
export const executionSuggestions = async (
  auth: IntervalsAuth,
  config: CoachConfig,
  completions: readonly Completion[],
  activities: readonly Activity[],
  today: string,
): Promise<readonly ThresholdSuggestion[]> => {
  const recent = completions
    .filter(holdsTargets)
    .filter((completion) => {
      const age = diffDays(completion.date, today)
      return age >= 0 && age <= EXECUTION_DRIFT_DAYS
    })
    .sort((left, right) => right.date.localeCompare(left.date))
  const sports = config.profile.sports.map((setting) => setting.sport)
  const latestTwo = (sport: Sport) =>
    recent.filter((completion) => findTemplate(completion.templateId)?.sport === sport).slice(0, 2)
  const readings = await readWorkMany(auth, config.profile, sports.flatMap(latestTwo), activities)

  return sports.flatMap((sport) => {
    const sessions: readonly ReadSession[] = latestTwo(sport).flatMap((completion) => {
      const reading = readings.get(completion.activityId)
      return reading ? [{ date: completion.date, reading }] : []
    })
    const suggestion = executionSuggestion(config.profile, sport, sessions)
    return suggestion ? [suggestion] : []
  })
}
