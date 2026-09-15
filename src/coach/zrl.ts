import type { Activity } from './types.ts'

/** Zwift names every league race after it: "Zwift - TTT: Zwift Racing League: … on <route> in <world>". */
const ZRL_PATTERN = /zwift racing league/i

/**
 * A race is its own session, not a proposal done differently. Taken for one, a
 * race full of VO2max minutes would unlock a progression level it never earned.
 */
export const isZrlRace = (activity: Pick<Activity, 'name'>): boolean =>
  ZRL_PATTERN.test(activity.name)
