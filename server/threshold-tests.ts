import type { IntervalsAuth } from './intervals.ts'
import { fetchActivityIntervals } from './intervals.ts'
import type { Completion } from '../src/coach/progression.ts'
import type { CoachConfig, Sport, ThresholdSuggestion } from '../src/coach/types.ts'
import { diffDays } from '../src/coach/dates.ts'
import { findTemplate } from '../src/coach/library.ts'
import { TEST_INTERVAL_WEEKS } from '../src/coach/threshold-test.ts'
import { thresholdFromTest } from '../src/coach/test-result.ts'
import { measuredSuggestion } from '../src/coach/threshold-drift.ts'

/** How long a completed test still speaks for itself before the estimate takes over. */
const TEST_RESULT_DAYS = 21
/** Below this the prescribed block was not actually held, so it measured nothing. */
const MIN_TEST_COMPLIANCE = 75
/**
 * A recognised test was never sent as a structured workout, so an ordinary
 * threshold session ridden on test day looks just like one — and reads about
 * five percent low. From such a ride only a result near or above the current
 * value is believed; a real drop still shows up in the intervals.icu estimate.
 */
const MAX_RECOGNISED_DROP_PERCENT = 3

export type TestResults = {
  /** Without the recognised tests that did not hold up, so the test clock is not reset by them. */
  readonly completions: readonly Completion[]
  readonly suggestions: readonly ThresholdSuggestion[]
}

type Reading = {
  readonly completion: Completion
  readonly sport: Sport
  readonly value: number | null
}

const isTest = (completion: Completion): boolean =>
  findTemplate(completion.templateId)?.measures === 'threshold'

/** Older recognised tests no longer hold the test clock back, so they are not worth a call. */
const worthReading = (completion: Completion, today: string): boolean =>
  completion.evidence === 'calendar'
    ? diffDays(completion.date, today) <= TEST_RESULT_DAYS &&
      (completion.compliance ?? 0) >= MIN_TEST_COMPLIANCE
    : diffDays(completion.date, today) < TEST_INTERVAL_WEEKS * 7

const read = async (
  auth: IntervalsAuth,
  config: CoachConfig,
  completion: Completion,
  sport: Sport,
): Promise<Reading> => {
  // One extra call, only for a test that was actually done.
  const efforts = await fetchActivityIntervals(auth, completion.activityId).catch(() => [])
  const result = thresholdFromTest(sport, efforts)
  if (!result) return { completion, sport, value: null }
  const drift = measuredSuggestion(config.profile, sport, result.value)?.driftPercent ?? 0
  const believed = completion.evidence === 'calendar' || drift >= -MAX_RECOGNISED_DROP_PERCENT
  return { completion, sport, value: believed ? result.value : null }
}

/**
 * Reads the threshold off the tests the athlete actually completed. The app
 * prescribed the maximal block, so it knows which effort was the measurement —
 * waiting for someone else's estimate to move would defeat the point of testing.
 */
export const readThresholdTests = async (
  auth: IntervalsAuth,
  config: CoachConfig,
  completions: readonly Completion[],
  today: string,
): Promise<TestResults> => {
  const readings = await Promise.all(
    completions
      .filter(isTest)
      .filter((completion) => worthReading(completion, today))
      .flatMap((completion) => {
        const sport = findTemplate(completion.templateId)?.sport
        return sport ? [read(auth, config, completion, sport)] : []
      }),
  )

  const discarded = readings
    .filter((reading) => reading.completion.evidence !== 'calendar' && reading.value === null)
    .map((reading) => reading.completion.activityId)

  const newestPerSport = new Map<Sport, number>()
  for (const reading of [...readings].sort((left, right) =>
    right.completion.date.localeCompare(left.completion.date),
  )) {
    const recent = diffDays(reading.completion.date, today) <= TEST_RESULT_DAYS
    if (reading.value !== null && recent && !newestPerSport.has(reading.sport)) {
      newestPerSport.set(reading.sport, reading.value)
    }
  }

  return {
    completions: completions.filter(
      (completion) => !(isTest(completion) && discarded.includes(completion.activityId)),
    ),
    suggestions: [...newestPerSport]
      .map(([sport, value]) => measuredSuggestion(config.profile, sport, value))
      .filter((entry): entry is ThresholdSuggestion => entry !== null),
  }
}
