import type { ZrlFormat, ZrlRace, ZwiftRoute } from '../coach/types.ts'
import { addDays, weekdayDe } from '../coach/dates.ts'

/** One line of the round as it is being edited: the route is still typed text. */
export type ZrlRow = {
  readonly date: string
  readonly format: ZrlFormat | ''
  readonly route: string
  readonly laps: number
}

export type ZrlRaceInput = {
  readonly date: string
  readonly format: ZrlFormat
  readonly laps: number
  readonly routeId: number | null
}

const TUESDAY = 'Di'
const MAX_WEEKS = 12

export const routeLabel = (route: ZwiftRoute): string => `${route.name} · ${route.world}`

export const rowOf = (race: ZrlRace): ZrlRow => ({
  date: race.date,
  format: race.format,
  route: race.route ? routeLabel(race.route) : '',
  laps: race.laps,
})

export const inputOf = (race: ZrlRace): ZrlRaceInput => ({
  date: race.date,
  format: race.format,
  laps: race.laps,
  routeId: race.route?.id ?? null,
})

/** League races are on Tuesdays; the first one from today on is where a round usually starts. */
export const nextTuesday = (today: string): string =>
  Array.from({ length: 7 }, (_unused, offset) => addDays(today, offset)).find(
    (date) => weekdayDe(date) === TUESDAY,
  ) ?? today

/** Adds one date per week, leaving dates that are already entered as they are. */
export const withRound = (
  rows: readonly ZrlRow[],
  start: string,
  weeks: number,
): readonly ZrlRow[] => {
  const count = Math.min(Math.max(Math.trunc(weeks), 1), MAX_WEEKS)
  const added = Array.from({ length: count }, (_unused, week) => addDays(start, week * 7))
    .filter((date) => !rows.some((row) => row.date === date))
    .map((date): ZrlRow => ({ date, format: '', route: '', laps: 1 }))
  return [...rows, ...added].sort((left, right) => left.date.localeCompare(right.date))
}

/** The full label from the list, or a route name that fits exactly one route. */
const resolveRoute = (text: string, routes: readonly ZwiftRoute[]): ZwiftRoute | undefined => {
  const wanted = text.trim().toLowerCase()
  const byLabel = routes.find((route) => routeLabel(route).toLowerCase() === wanted)
  if (byLabel) return byLabel
  const byName = routes.filter((route) => route.name.toLowerCase() === wanted)
  return byName.length === 1 ? byName[0] : undefined
}

const shortDate = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.`

export const racesFrom = (
  rows: readonly ZrlRow[],
  routes: readonly ZwiftRoute[],
): { readonly races: readonly ZrlRaceInput[] } | { readonly error: string } => {
  const issues = rows.flatMap((row) => {
    const route = row.route.trim() === '' ? null : resolveRoute(row.route, routes)
    return [
      ...(row.format === '' ? [`${shortDate(row.date)}: Format fehlt`] : []),
      ...(route === undefined
        ? [`${shortDate(row.date)}: Route „${row.route.trim()}" nicht gefunden`]
        : []),
    ]
  })
  if (issues.length > 0) return { error: issues.join(' · ') }

  return {
    races: rows.map((row) => ({
      date: row.date,
      format: row.format as ZrlFormat,
      laps: Math.max(1, Math.trunc(row.laps) || 1),
      routeId: row.route.trim() === '' ? null : (resolveRoute(row.route, routes)?.id ?? null),
    })),
  }
}
