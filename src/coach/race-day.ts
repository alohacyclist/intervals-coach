import type {
  CoachConfig,
  DayType,
  PlannedSession,
  Sport,
  TrainingState,
  ZrlRace,
} from './types.ts'
import { addDays } from './dates.ts'
import { breakLimit } from './breaks.ts'
import { buildSession } from './session.ts'
import { estimateRace, formatLabel, leagueRaceOn, raceDetails, raceTemplate } from './zrl.ts'

type Decision = { readonly dayType: DayType; readonly reason: string; readonly optional: boolean }

export type RacesAround = {
  readonly race: ZrlRace | null
  readonly raceTomorrow: ZrlRace | null
  /** Whether the day before a race is kept easy; the race itself stays either way. */
  readonly taper: boolean
}

/**
 * A race on a day with a declared break is not going to be ridden, so it shapes
 * nothing — and a break running today outranks tomorrow's race as well.
 */
export const racesAround = (
  config: CoachConfig,
  sports: readonly Sport[],
  date: string,
): RacesAround => {
  const free = (day: string) => breakLimit(config.breaks, day) === null
  const { taper } = config.zrl
  if (!sports.includes('Ride') || !free(date)) return { race: null, raceTomorrow: null, taper }
  const tomorrow = addDays(date, 1)
  return {
    race: leagueRaceOn(config.zrl, config.zrlRaces, date),
    raceTomorrow: free(tomorrow) ? leagueRaceOn(config.zrl, config.zrlRaces, tomorrow) : null,
    taper,
  }
}

const raceLabel = (race: ZrlRace): string =>
  `ZRL ${formatLabel(race)}${race.route ? ` auf ${race.route.name}` : ''}`

/**
 * The athlete only knows on the day whether they race, so the day is planned to
 * suit both: a quality day either way, and an easy day with openers before it.
 * A recovery week keeps its rest, and a body that is plainly not ready keeps
 * whatever the plan had decided — the race is still offered, never pushed.
 */
export const aroundRace = (
  decision: Decision,
  around: RacesAround,
  recoveryWeek: boolean,
  exhausted: boolean,
  recentlyHard: boolean,
): Decision => {
  const { race, raceTomorrow } = around
  if (race) {
    const label = raceLabel(race)
    if (recoveryWeek) {
      return {
        dayType: 'EASY',
        optional: false,
        reason: `${label} — Erholungswoche: das Rennen nur freiwillig, die Alternative bleibt locker`,
      }
    }
    if (exhausted)
      return { ...decision, reason: `${decision.reason} · ${label} nur, wenn es sich gut anfühlt` }
    const warning = recentlyHard ? ' Achtung: die letzte harte Einheit ist keine 48 h her.' : ''
    return {
      dayType: 'KEY',
      optional: false,
      reason: `${label} — Rennen oder eine gleichwertige Qualitätseinheit.${warning}`,
    }
  }
  if (raceTomorrow && around.taper && !exhausted) {
    return {
      dayType: 'EASY',
      optional: false,
      reason: `Morgen ${raceLabel(raceTomorrow)} — heute locker mit kurzen Antritten, damit die Beine wach sind`,
    }
  }
  return decision
}

export const raceSession = (
  race: ZrlRace,
  state: TrainingState,
  config: CoachConfig,
  dayType: DayType,
): PlannedSession => {
  const estimate = estimateRace(race, state.raceHistory, config.zrlRaces)
  const reason = `${raceLabel(race)} · geschätzt ${estimate.minutes} min mit Aufwärmen, ${estimate.load} TSS${dayType === 'KEY' ? '' : ' · freiwillig'}`
  return {
    ...buildSession(raceTemplate(race, estimate), config, reason),
    race: raceDetails(race, estimate),
  }
}

/** First on a quality day, where it is the plan; last otherwise, where it is only an offer. */
export const withRace = (
  options: readonly PlannedSession[],
  race: PlannedSession | null,
  dayType: DayType,
): readonly PlannedSession[] => {
  if (race === null) return options
  return dayType === 'KEY' ? [race, ...options] : [...options, race]
}
