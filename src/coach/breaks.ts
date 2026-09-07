import type { BreakKind, DayType, TrainingBreak } from './types.ts'
import { addDays, diffDays } from './dates.ts'

/**
 * A declared break outranks everything the plan would otherwise work out. It is
 * the one input the athlete has that no measurement can supply: a vaccination
 * does not show up in HRV until the body reacts, and by then the session has
 * already been done.
 *
 * Two things follow from a break, not one. During it the ceiling drops, and
 * anything still offered is voluntary — "easy sessions if at all", never a plan
 * to live up to. After it, coming back at full intensity is its own mistake, so
 * a return window keeps maximal work off the table for a few more days.
 */

export const BREAK_LABELS: Readonly<Record<BreakKind, string>> = {
  illness: 'Krankheit',
  vaccination: 'Impfung',
  injury: 'Verletzung',
  pause: 'Pause',
}

/** Where the entry form starts. The athlete can always change it. */
export const BREAK_DEFAULT_DAYS: Readonly<Record<BreakKind, number>> = {
  illness: 7,
  vaccination: 3,
  injury: 14,
  pause: 7,
}

type Recovery = {
  /** Opening days on which nothing is offered at all. */
  readonly restDays: number
  /** Days after the break during which VO2max work stays off the table. */
  readonly returnDays: number
  readonly during: string
  readonly returning: string
}

const RECOVERY: Readonly<Record<BreakKind, Recovery>> = {
  vaccination: {
    restDays: 2,
    returnDays: 3,
    during:
      'Die Reaktion kommt meist erst 12 bis 36 Stunden später, nicht sofort. Erst zwei Tage nichts, danach höchstens locker.',
    returning: 'Zurück nach der Impfung — Schwelle vor VO₂max.',
  },
  illness: {
    restDays: 3,
    returnDays: 7,
    during:
      'Bei Fieber oder Beschwerden unterhalb des Halses gehört Training ganz weg. Grund ist das Risiko einer Herzmuskelentzündung, nicht die Leistung.',
    returning: 'Erste Woche zurück nach Krankheit — Umfang vor Intensität, VO₂max wartet.',
  },
  injury: {
    restDays: 0,
    returnDays: 5,
    during: 'Was schmerzfrei geht, darf locker weiterlaufen. Alles andere pausiert.',
    returning: 'Zurück nach der Verletzung — erst wieder Belastung aufbauen, dann Spitzen.',
  },
  pause: {
    restDays: 0,
    returnDays: 0,
    during:
      'Keine körperliche Einschränkung — der Plan hält still und drängt nicht auf das Wochenpensum.',
    returning: '',
  },
}

const covers = (entry: TrainingBreak, date: string): boolean =>
  date >= entry.from && date <= entry.until

export const activeBreak = (
  breaks: readonly TrainingBreak[],
  date: string,
): TrainingBreak | null => breaks.find((entry) => covers(entry, date)) ?? null

export type BreakLimit = {
  readonly kind: BreakKind
  readonly dayType: DayType
  readonly reason: string
  readonly daysLeft: number
}

/** The hardest thing allowed today, and why — null when no break is running. */
export const breakLimit = (
  breaks: readonly TrainingBreak[],
  date: string,
): BreakLimit | null => {
  const entry = activeBreak(breaks, date)
  if (!entry) return null

  const recovery = RECOVERY[entry.kind]
  const dayOfBreak = diffDays(entry.from, date)
  const daysLeft = diffDays(date, entry.until) + 1
  const resting = dayOfBreak < recovery.restDays
  const label = BREAK_LABELS[entry.kind]
  const remaining = `noch ${daysLeft} Tag${daysLeft === 1 ? '' : 'e'}`

  return {
    kind: entry.kind,
    dayType: resting ? 'REST' : 'EASY',
    daysLeft,
    reason: resting
      ? `${label} eingetragen, ${remaining} — heute nichts. ${recovery.during}`
      : `${label} eingetragen, ${remaining} — höchstens locker, freiwillig. ${recovery.during}`,
  }
}

/** The break that ended recently enough to still hold intensity back. */
export const returnWindow = (
  breaks: readonly TrainingBreak[],
  date: string,
): { readonly kind: BreakKind; readonly note: string } | null => {
  const ended = breaks
    .filter((entry) => entry.until < date)
    .sort((left, right) => right.until.localeCompare(left.until))[0]
  if (!ended) return null

  const recovery = RECOVERY[ended.kind]
  const since = diffDays(ended.until, date)
  return since <= recovery.returnDays && recovery.returning.length > 0
    ? { kind: ended.kind, note: recovery.returning }
    : null
}

/**
 * Stopping a break early frees today, so it ends yesterday. Stopped on its own
 * first day it covers nothing at all, and the caller drops it instead.
 */
export const endedBefore = (entry: TrainingBreak, today: string): TrainingBreak | null => {
  const until = addDays(today, -1)
  return until < entry.from ? null : { ...entry, until }
}
