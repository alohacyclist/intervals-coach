import type {
  Activity,
  BenchmarkResult,
  BenchmarkStatus,
  CoachConfig,
  Phase,
  Sport,
} from './types.ts'
import type { Completion } from './progression.ts'
import { LIBRARY } from './library.ts'
import { diffDays } from './dates.ts'
import { selectedSports } from './thresholds.ts'

export const BENCHMARK_INTERVAL_WEEKS = 8
/** Heart rate wanders a couple of beats day to day; less than this proves nothing. */
const MEANINGFUL_HR_DELTA = 2

export const benchmarkTemplateFor = (sport: Sport) =>
  LIBRARY.find(
    (template) =>
      template.benchmark === true && template.sport === sport && template.measures !== 'threshold',
  )

/**
 * Only the repeated reference session counts towards its own cadence. A
 * threshold test is also a benchmark, but it answers a different question and
 * must not push the comparison session eight weeks into the future.
 */
const isBenchmark = (templateId: string): boolean =>
  LIBRARY.some(
    (template) =>
      template.id === templateId &&
      template.benchmark === true &&
      template.measures !== 'threshold',
  )

export type BenchmarkDue = {
  readonly sport: Sport
  readonly templateId: string
  readonly reason: string
}

/**
 * The reference session belongs in the plan, not on a card with a button: an
 * athlete should not have to decide when to measure. Same work every time, so
 * only the heart rate it costs has to be compared — a threshold test answers a
 * different question and sets the numbers themselves.
 */
export const benchmarkDue = (
  sport: Sport,
  completions: readonly Completion[],
  today: string,
  planStart: string,
  phase: Phase,
  returning: boolean,
  budgetMinutes: number,
): BenchmarkDue | null => {
  const template = benchmarkTemplateFor(sport)
  if (!template) return null
  if (phase === 'TAPER' || phase === 'RECOVERY') return null
  if (returning) return null
  if (template.minutes > budgetMinutes) return null

  const done = completions
    .filter((completion) => completion.templateId === template.id)
    .map((completion) => diffDays(completion.date, today))
    .filter((age) => age >= 0)
  const since = done.length === 0 ? diffDays(planStart, today) : Math.min(...done)
  if (since < BENCHMARK_INTERVAL_WEEKS * 7) return null

  return {
    sport,
    templateId: template.id,
    reason:
      done.length === 0
        ? 'Formkontrolle: dieselbe Einheit alle acht Wochen, unverändert. Verglichen wird die Herzfrequenz, die sie kostet — heute wird die erste Referenz gesetzt.'
        : `Formkontrolle: dieselbe Einheit wie vor ${Math.floor(since / 7)} Wochen, identische Vorgaben. Weniger Schläge für dieselbe Arbeit ist der Fortschritt.`,
  }
}

const verdictFor = (
  current: number | null,
  previous: number | null,
  hasPrevious: boolean,
): BenchmarkResult['verdict'] => {
  // A previous session without heart rate is not the same as no previous session.
  if (!hasPrevious) return 'first'
  if (current === null || previous === null) return 'unknown'
  const delta = current - previous
  if (Math.abs(delta) < MEANINGFUL_HR_DELTA) return 'unchanged'
  // Same work at a lower heart rate is the improvement this session measures.
  return delta < 0 ? 'better' : 'worse'
}

const describe = (result: Omit<BenchmarkResult, 'message'>): string => {
  const { averageHr, previousAverageHr, previousDate } = result
  if (result.verdict === 'first') {
    return averageHr === null
      ? 'Erste Referenz gesetzt. Beim nächsten Mal gibt es einen Vergleich.'
      : `Erste Referenz: ${Math.round(averageHr)} bpm im Schnitt. Beim nächsten Mal gibt es einen Vergleich.`
  }
  if (result.verdict === 'unknown' || averageHr === null || previousAverageHr === null) {
    return 'Ohne Herzfrequenz lässt sich die Einheit nicht vergleichen.'
  }
  const delta = Math.round(averageHr - previousAverageHr)
  const since = previousDate ? ` gegenüber ${previousDate}` : ''
  if (result.verdict === 'unchanged') {
    return `${Math.round(averageHr)} bpm — unverändert${since}. Gleiche Arbeit, gleicher Preis.`
  }
  return result.verdict === 'better'
    ? `${Math.round(averageHr)} bpm statt ${Math.round(previousAverageHr)}${since}: ${Math.abs(delta)} Schläge weniger für dieselbe Arbeit. Das ist der Fortschritt.`
    : `${Math.round(averageHr)} bpm statt ${Math.round(previousAverageHr)}${since}: ${delta} Schläge mehr. Ermüdung, Hitze oder ein Formverlust — erst beim nächsten Mal wiederholen, bevor du daraus etwas ableitest.`
}

const resultFor = (
  sport: Sport,
  completions: readonly Completion[],
  activities: readonly Activity[],
): BenchmarkResult | null => {
  const template = benchmarkTemplateFor(sport)
  if (!template) return null
  const done = completions
    .filter((completion) => completion.templateId === template.id)
    .sort((left, right) => left.date.localeCompare(right.date))
  const latest = done[done.length - 1]
  if (!latest) return null

  const hrOf = (completion: Completion) =>
    activities.find((activity) => activity.id === completion.activityId)?.averageHr ?? null
  const previous = done[done.length - 2] ?? null

  const partial = {
    sport,
    date: latest.date,
    averageHr: hrOf(latest),
    previousDate: previous?.date ?? null,
    previousAverageHr: previous ? hrOf(previous) : null,
    verdict: verdictFor(hrOf(latest), previous ? hrOf(previous) : null, previous !== null),
  }
  return { ...partial, message: describe(partial) }
}

/**
 * A repeated reference session says more than a fresh threshold test: identical
 * work at a lower heart rate is progress, and it costs no separate test day.
 */
export const benchmarkStatus = (
  config: CoachConfig,
  completions: readonly Completion[],
  activities: readonly Activity[],
  today: string,
): BenchmarkStatus => {
  const sports = selectedSports(config.profile)
  const anyBenchmark = completions
    .filter((completion) => isBenchmark(completion.templateId))
    .map((completion) => completion.date)
    .sort()
  const lastDate = anyBenchmark[anyBenchmark.length - 1] ?? null
  const weeksSinceLast = lastDate === null ? null : Math.floor(diffDays(lastDate, today) / 7)
  const weeksSinceStart = Math.floor(diffDays(config.planStart, today) / 7)

  return {
    due: (weeksSinceLast ?? weeksSinceStart) >= BENCHMARK_INTERVAL_WEEKS,
    weeksSinceLast,
    intervalWeeks: BENCHMARK_INTERVAL_WEEKS,
    sessions: sports.flatMap((sport) => {
      const template = benchmarkTemplateFor(sport)
      return template ? [{ sport, templateId: template.id, name: template.name }] : []
    }),
    results: sports.flatMap((sport) => {
      const result = resultFor(sport, completions, activities)
      return result ? [result] : []
    }),
  }
}
