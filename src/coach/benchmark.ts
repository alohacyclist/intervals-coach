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
import type { WorkReading } from './efficiency.ts'
import { efficiencyChange } from './efficiency.ts'

export const BENCHMARK_INTERVAL_WEEKS = 8
/** Heart rate wanders a couple of beats day to day; less than this proves nothing. */
const MEANINGFUL_HR_DELTA = 2
/** Two beats at 160 is 1.25 %; pace per beat needs a little more than that to mean something. */
const MEANINGFUL_EFFICIENCY_PERCENT = 1.5

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
        ? 'Formkontrolle: dieselbe Einheit alle acht Wochen. Verglichen wird Tempo bzw. Leistung pro Herzschlag in den Intervallen — heute wird die erste Referenz gesetzt.'
        : `Formkontrolle: dieselbe Einheit wie vor ${Math.floor(since / 7)} Wochen. Mehr Arbeit pro Herzschlag ist der Fortschritt.`,
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

const describe = (result: Omit<BenchmarkResult, 'message' | 'basis' | 'efficiencyChange'>): string => {
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

/** One reference session as the comparison needs it. */
export type BenchmarkSession = {
  readonly date: string
  /** The work intervals alone; null when intervals.icu gave none to read. */
  readonly reading: WorkReading | null
  /** Over the whole activity: the fallback when the intervals cannot be read. */
  readonly averageHr: number | null
}

const shortDate = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.`

const intensityWord = (sport: Sport): string => (sport === 'Ride' ? 'Leistung' : 'Tempo')

/**
 * Pace per heartbeat over the work intervals: faster at the same heart rate, or
 * the same pace at a lower one, is the progress this session exists to show. A
 * session run faster than last time no longer reads as a loss because it cost
 * more beats.
 */
const byIntervals = (
  sport: Sport,
  latest: BenchmarkSession & { readonly reading: WorkReading },
  previous: BenchmarkSession & { readonly reading: WorkReading },
): BenchmarkResult | null => {
  const change = efficiencyChange(latest.reading, previous.reading)
  if (change === null) return null
  const verdict: BenchmarkResult['verdict'] =
    Math.abs(change) < MEANINGFUL_EFFICIENCY_PERCENT ? 'unchanged' : change > 0 ? 'better' : 'worse'
  const describeReading = (reading: WorkReading) =>
    `${Math.round(reading.percent)} % bei ${Math.round(reading.heartRate!)} bpm`
  const facts = `${intensityWord(sport)} ${describeReading(latest.reading)}, am ${shortDate(previous.date)} ${describeReading(previous.reading)}`
  const amount = Math.abs(Math.round(change * 10) / 10).toLocaleString('de-DE')
  const message =
    verdict === 'unchanged'
      ? `${facts}: gleiche Effizienz.`
      : verdict === 'better'
        ? `${facts}: ${amount} % effizienter. Das ist der Fortschritt.`
        : `${facts}: ${amount} % weniger effizient. Ermüdung, Hitze oder ein Formverlust — erst beim nächsten Mal wiederholen, bevor du daraus etwas ableitest.`
  return {
    sport,
    date: latest.date,
    averageHr: latest.reading.heartRate,
    previousDate: previous.date,
    previousAverageHr: previous.reading.heartRate,
    verdict,
    basis: 'intervals',
    efficiencyChange: Math.round(change * 10) / 10,
    message,
  }
}

/** The latest reference session against the one before it. */
export const compareBenchmarks = (
  sport: Sport,
  latest: BenchmarkSession,
  previous: BenchmarkSession | null,
): BenchmarkResult => {
  if (previous && latest.reading && previous.reading) {
    const result = byIntervals(sport, { ...latest, reading: latest.reading }, { ...previous, reading: previous.reading })
    if (result) return result
  }
  const partial = {
    sport,
    date: latest.date,
    // A first reference is best set over the work it will be compared on next time.
    averageHr: previous === null ? (latest.reading?.heartRate ?? latest.averageHr) : latest.averageHr,
    previousDate: previous?.date ?? null,
    previousAverageHr: previous?.averageHr ?? null,
    verdict: verdictFor(latest.averageHr, previous?.averageHr ?? null, previous !== null),
    basis: 'activity' as const,
    efficiencyChange: null,
  }
  return { ...partial, message: describe(partial) }
}

/** The reference sessions of one sport, oldest first. */
export const benchmarkCompletions = (sport: Sport, completions: readonly Completion[]): readonly Completion[] => {
  const template = benchmarkTemplateFor(sport)
  if (!template) return []
  return completions
    .filter((completion) => completion.templateId === template.id && completion.evidence !== 'similar')
    .sort((left, right) => left.date.localeCompare(right.date))
}

const resultFor = (
  sport: Sport,
  completions: readonly Completion[],
  activities: readonly Activity[],
  readings: ReadonlyMap<string, WorkReading>,
): BenchmarkResult | null => {
  const done = benchmarkCompletions(sport, completions)
  const latest = done[done.length - 1]
  if (!latest) return null
  const previous = done[done.length - 2] ?? null
  const session = (completion: Completion): BenchmarkSession => ({
    date: completion.date,
    reading: readings.get(completion.activityId) ?? null,
    averageHr: activities.find((activity) => activity.id === completion.activityId)?.averageHr ?? null,
  })
  return compareBenchmarks(sport, session(latest), previous ? session(previous) : null)
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
  /** Work intervals of the reference sessions, by activity; without them heart rate is compared over the whole activity. */
  readings: ReadonlyMap<string, WorkReading> = new Map(),
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
      const result = resultFor(sport, completions, activities, readings)
      return result ? [result] : []
    }),
  }
}
