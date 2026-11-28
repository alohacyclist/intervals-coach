import type { DashboardRide, DashboardWeek } from './dashboard.ts'
import { startOfWeek } from './dates.ts'

/** Weeks in each of the two windows the trend compares. */
export const TREND_WEEKS = 4
/** Fewer even rides per window and place, and one odd day would carry the whole trend. */
export const TREND_MIN_RIDES = 3

export type EfficiencyTrend = {
  readonly indoor: boolean
  /** Mean efficiency factor of the latest four weeks, W/bpm. */
  readonly recent: number | null
  /** Mean of the four weeks before. */
  readonly earlier: number | null
  readonly recentRides: number
  readonly earlierRides: number
  /** Recent against earlier, 0.03 for 3 % higher; null below TREND_MIN_RIDES in either window. */
  readonly change: number | null
}

export const efficiencyAt = (week: DashboardWeek, indoor: boolean): number | null =>
  indoor ? week.efficiency.indoor : week.efficiency.outdoor

/** The newest week with a value for that place. */
export const lastEfficiency = (weeks: readonly DashboardWeek[], indoor: boolean): number | null =>
  [...weeks].reverse().map((w) => efficiencyAt(w, indoor)).find((v) => v !== null) ?? null

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length

/**
 * Efficiency factor of the latest four shown weeks against the four before, for one place.
 * Ride by ride, not week by week: a week with one ride must not weigh like a week with five.
 */
export const efficiencyTrend = (
  rides: readonly DashboardRide[],
  weeks: readonly DashboardWeek[],
  indoor: boolean,
): EfficiencyTrend => {
  const starts = weeks.map((w) => w.weekStart)
  const valuesIn = (window: ReadonlySet<string>): readonly number[] =>
    rides.flatMap((r) =>
      r.indoor === indoor && r.efficiencyFactor !== null && window.has(startOfWeek(r.date)) ? [r.efficiencyFactor] : [],
    )
  const recentValues = valuesIn(new Set(starts.slice(-TREND_WEEKS)))
  const earlierValues = valuesIn(new Set(starts.slice(-2 * TREND_WEEKS, -TREND_WEEKS)))
  const recent = mean(recentValues)
  const earlier = mean(earlierValues)
  const enough = recentValues.length >= TREND_MIN_RIDES && earlierValues.length >= TREND_MIN_RIDES
  return {
    indoor,
    recent,
    earlier,
    recentRides: recentValues.length,
    earlierRides: earlierValues.length,
    change: enough && recent !== null && earlier !== null ? recent / earlier - 1 : null,
  }
}
