import type { Readiness, ReadinessScore, Wellness } from './types.ts'
import { diffDays } from './dates.ts'

const BASELINE_DAYS = 30
const MIN_BASELINE_SAMPLES = 7
const MIN_SLEEP_SECONDS = 6 * 3600

type Flag = { readonly severity: 'amber' | 'red'; readonly reason: string }

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const stdDev = (values: readonly number[]): number => {
  const average = mean(values)
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance)
}

const baselineWindow = (
  wellness: readonly Wellness[],
  today: string,
): readonly Wellness[] =>
  wellness.filter((entry) => {
    const age = diffDays(entry.date, today)
    return age > 0 && age <= BASELINE_DAYS
  })

const numbers = (entries: readonly Wellness[], pick: (entry: Wellness) => number | null): number[] =>
  entries.map(pick).filter((value): value is number => typeof value === 'number' && value > 0)

const hrvFlag = (todayHrv: number | null, baseline: readonly number[]): Flag | null => {
  if (todayHrv === null || baseline.length < MIN_BASELINE_SAMPLES) return null
  const average = mean(baseline)
  const sd = stdDev(baseline)
  if (sd === 0) return null
  if (todayHrv < average - 2 * sd) {
    return { severity: 'red', reason: `HRV ${todayHrv} deutlich unter Baseline (${Math.round(average)})` }
  }
  if (todayHrv < average - sd) {
    return { severity: 'amber', reason: `HRV ${todayHrv} unter Baseline (${Math.round(average)})` }
  }
  return null
}

const restingHrFlag = (todayRhr: number | null, baseline: readonly number[]): Flag | null => {
  if (todayRhr === null || baseline.length < MIN_BASELINE_SAMPLES) return null
  const average = mean(baseline)
  const sd = Math.max(stdDev(baseline), 1)
  if (todayRhr > average + 2 * sd) {
    return { severity: 'red', reason: `Ruhepuls ${todayRhr} deutlich über Baseline (${Math.round(average)})` }
  }
  if (todayRhr > average + sd) {
    return { severity: 'amber', reason: `Ruhepuls ${todayRhr} über Baseline (${Math.round(average)})` }
  }
  return null
}

const sleepFlag = (sleepSecs: number | null): Flag | null =>
  sleepSecs !== null && sleepSecs > 0 && sleepSecs < MIN_SLEEP_SECONDS
    ? { severity: 'amber', reason: `Nur ${(sleepSecs / 3600).toFixed(1)}h Schlaf` }
    : null

const subjectiveFlag = (entry: Wellness | undefined): Flag | null => {
  if (!entry) return null
  const worst = Math.max(entry.fatigue ?? 0, entry.soreness ?? 0)
  if (worst >= 4) return { severity: 'red', reason: 'Subjektiv sehr müde / schwere Beine' }
  if (worst === 3) return { severity: 'amber', reason: 'Subjektiv müde' }
  return null
}

const formFlag = (tsb: number): Flag | null => {
  if (tsb < -30) return { severity: 'red', reason: `Form ${tsb} — deutliche Überlastung` }
  if (tsb < -18) return { severity: 'amber', reason: `Form ${tsb} — hohe Ermüdung` }
  return null
}

const scoreFrom = (flags: readonly Flag[]): ReadinessScore => {
  if (flags.some((flag) => flag.severity === 'red')) return 'red'
  if (flags.filter((flag) => flag.severity === 'amber').length >= 2) return 'red'
  return flags.length > 0 ? 'amber' : 'green'
}

export const computeReadiness = (
  wellness: readonly Wellness[],
  today: string,
  tsb: number,
): Readiness => {
  const entry = wellness.find((item) => item.date === today)
  const baseline = baselineWindow(wellness, today)
  const flags: readonly Flag[] = [
    hrvFlag(entry?.hrv ?? null, numbers(baseline, (item) => item.hrv)),
    restingHrFlag(entry?.restingHr ?? null, numbers(baseline, (item) => item.restingHr)),
    sleepFlag(entry?.sleepSecs ?? null),
    subjectiveFlag(entry),
    formFlag(tsb),
  ].filter((flag): flag is Flag => flag !== null)

  return {
    score: scoreFrom(flags),
    reasons: flags.length > 0 ? flags.map((flag) => flag.reason) : ['Keine Warnsignale'],
  }
}
