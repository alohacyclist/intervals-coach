import type { Fitness, Phase, Sport } from './types.ts'
import type { Completion } from './progression.ts'
import { diffDays } from './dates.ts'
import { thresholdTestFor } from './library.ts'

/**
 * When to measure a threshold instead of estimating it.
 *
 * Every estimate is bounded by what the athlete has attempted. Interval work
 * proves a floor and never a ceiling, so an athlete who trains well but never
 * tests watches their estimated threshold drift downwards — and the plan then
 * prescribes targets that are too easy, which makes the next estimate lower
 * still. The way out is a measurement, and it is scheduled by the plan rather
 * than left to the athlete, who has every reason to keep putting it off.
 */

export const TEST_INTERVAL_WEEKS = 10
const TEST_INTERVAL_DAYS = TEST_INTERVAL_WEEKS * 7

/** A maximal effort on tired legs measures the fatigue, not the threshold. */
const MIN_TSB = -15
/** Matching the engine: after this long away, the first session back is not a test. */
const LAYOFF_DAYS = 10

export type ThresholdTest = {
  readonly sport: Sport
  readonly templateId: string
  readonly reason: string
}

const daysSinceLast = (
  completions: readonly Completion[],
  templateId: string,
  today: string,
): number | null => {
  const ages = completions
    .filter((completion) => completion.templateId === templateId)
    .map((completion) => diffDays(completion.date, today))
    .sort((left, right) => left - right)
  return ages[0] ?? null
}

/**
 * Whether today should measure this sport's threshold. Everything that would
 * spoil the measurement rules it out: a taper belongs to the race, a recovery
 * week to recovering, the days after a break to coming back, and deep fatigue
 * to anything but this.
 */
export const thresholdTestDue = (
  sport: Sport,
  completions: readonly Completion[],
  today: string,
  fitness: Fitness,
  phase: Phase,
  returning: boolean,
  budgetMinutes: number,
  daysSinceAnySession: number,
): ThresholdTest | null => {
  const template = thresholdTestFor(sport)
  if (!template) return null
  if (phase === 'TAPER' || phase === 'RECOVERY') return null
  if (returning) return null
  if (fitness.tsb < MIN_TSB) return null
  // The plan promises never to exceed the stated time budget, and a test is no
  // reason to break that promise behind the athlete's back.
  if (template.minutes > budgetMinutes) return null
  // Straight off a long layoff the number would say more about the layoff.
  if (daysSinceAnySession >= LAYOFF_DAYS) return null

  const since = daysSinceLast(completions, template.id, today)
  if (since === null) {
    return {
      sport,
      templateId: template.id,
      reason:
        'Standortbestimmung: deine Schwelle ist bisher nie gemessen worden. Aus Intervallen lässt sie sich nur nach unten begrenzen, nie nach oben — alle Vorgaben hängen aber daran.',
    }
  }
  if (since >= TEST_INTERVAL_DAYS) {
    return {
      sport,
      templateId: template.id,
      reason: `Standortbestimmung: die letzte liegt ${Math.round(since / 7)} Wochen zurück. Zeit, den Wert wieder zu belegen statt ihn fortzuschreiben.`,
    }
  }
  return null
}
