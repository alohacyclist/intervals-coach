import { describe, expect, it } from 'vitest'
import { buildDashboardSummary } from '../src/coach/dashboard.ts'
import { efficiencyTrend, lastEfficiency, TREND_MIN_RIDES } from '../src/coach/dashboard-trend.ts'
import type { Activity } from '../src/coach/types.ts'
import { trendSentence } from '../src/ui/dashboard/model.ts'
import { activity, TODAY } from './fixtures.ts'

const ride = (daysAgo: number, efficiencyFactor: number, indoor = false, variabilityIndex = 1.02): Activity =>
  activity(daysAgo, 'Ride', {
    id: `r${daysAgo}`,
    rideStats: { averageWatts: 200, normalizedWatts: 204, efficiencyFactor, variabilityIndex, decouplingPct: null, indoor },
  })

// TODAY is a Wednesday: days 0 to 23 fall into the latest four weeks, 30 to 51 into the four before.
const recent = [1, 8, 15]
const earlier = [30, 37, 44]

describe('efficiencyTrend', () => {
  it('compares the latest four weeks with the four before, ride by ride', () => {
    const rides = [...recent.map((d) => ride(d, 1.65)), ...earlier.map((d) => ride(d, 1.5))]
    const summary = buildDashboardSummary(rides, TODAY, 8)
    const trend = efficiencyTrend(summary.rides, summary.weeks, false)
    expect(trend).toMatchObject({ recentRides: 3, earlierRides: 3 })
    expect(trend.change).toBeCloseTo(0.1)
    expect(trendSentence(trend)).toBe('Draußen: EF der letzten 4 Wochen +10,0 % gegenüber den 4 Wochen davor, aus 3 und 3 Fahrten.')
  })

  it('keeps indoor rides out of the outdoor trend and says when rides are missing', () => {
    const rides = [...recent.map((d) => ride(d, 1.65)), ride(30, 1.5), ride(37, 1.2, true), ride(44, 1.5, false, 1.2)]
    const summary = buildDashboardSummary(rides, TODAY, 8)
    const outdoor = efficiencyTrend(summary.rides, summary.weeks, false)
    expect(outdoor).toMatchObject({ earlierRides: 1, change: null })
    expect(TREND_MIN_RIDES).toBe(3)
    expect(trendSentence(outdoor)).toContain('zu wenig gleichmäßige Fahrten')
    expect(efficiencyTrend(summary.rides, summary.weeks, true)).toMatchObject({ recentRides: 0, earlierRides: 1, change: null })
  })

  it('reads the newest week that has a value for the place', () => {
    const summary = buildDashboardSummary([ride(1, 1.6), ride(10, 1.3, true)], TODAY, 8)
    expect(lastEfficiency(summary.weeks, false)).toBe(1.6)
    expect(lastEfficiency(summary.weeks, true)).toBe(1.3)
  })
})
