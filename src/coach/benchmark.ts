import type { Activity, BenchmarkResult, BenchmarkStatus, CoachConfig, Sport } from './types.ts'
import type { Completion } from './progression.ts'
import { LIBRARY } from './library.ts'
import { diffDays } from './dates.ts'
import { selectedSports } from './thresholds.ts'

export const BENCHMARK_INTERVAL_WEEKS = 8
/** Heart rate wanders a couple of beats day to day; less than this proves nothing. */
const MEANINGFUL_HR_DELTA = 2

const benchmarkFor = (sport: Sport) =>
  LIBRARY.find((template) => template.benchmark === true && template.sport === sport)

const isBenchmark = (templateId: string): boolean =>
  LIBRARY.some((template) => template.id === templateId && template.benchmark === true)

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
  const template = benchmarkFor(sport)
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
      const template = benchmarkFor(sport)
      return template ? [{ sport, templateId: template.id, name: template.name }] : []
    }),
    results: sports.flatMap((sport) => {
      const result = resultFor(sport, completions, activities)
      return result ? [result] : []
    }),
  }
}
