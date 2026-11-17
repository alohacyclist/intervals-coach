import { describe, expect, it } from 'vitest'
import {
  buildForecast,
  enduranceShortfall,
  RUN_TYPICAL_VDOT_PER_WEEK,
  rideShape,
  runShape,
  TAPER_DAYS,
  weeklyGains,
} from '../src/coach/forecast.ts'
import { addDays } from '../src/coach/dates.ts'
import { raceSeconds } from '../src/coach/vdot.ts'
import type { StandingTraining } from '../src/coach/types.ts'
import { TODAY } from './fixtures.ts'

const training = (overrides: Partial<StandingTraining> = {}): StandingTraining => ({
  ctl: 40,
  ctlChange: 0,
  weeklyHours: 4,
  weeklyKm: 40,
  longestKm: 18,
  hardSessions: 3,
  ...overrides,
})

const typical = RUN_TYPICAL_VDOT_PER_WEEK

const halfIn = (weeks: number, overrides: Partial<Parameters<typeof buildForecast>[0]> = {}) =>
  buildForecast(
    {
      today: TODAY,
      date: addDays(TODAY, weeks * 7),
      fitness: 50,
      gains: weeklyGains(typical, typical, 'solid', null),
      quality: 'solid',
      tapered: true,
      shortfall: 0,
      goal: null,
      ...overrides,
    },
    runShape(21097.5),
  )

describe('the gain each case assumes', () => {
  it('trusts a solid trend, but never past typical', () => {
    expect(weeklyGains(1, typical, 'solid', null).likely).toBe(typical)
    expect(weeklyGains(typical / 2, typical, 'solid', null).likely).toBe(typical / 2)
  })

  it('assumes no further fall in the likely case, and lets it run on at half the slope in the worst', () => {
    const gains = weeklyGains(-typical / 2, typical, 'solid', null)
    expect(gains.likely).toBe(0)
    expect(gains.worst).toBe(-typical / 4)
    expect(weeklyGains(-typical * 3, typical, 'solid', null).worst).toBe(-typical / 2)
  })

  it('falls back on the rest of the training without a trend', () => {
    expect(weeklyGains(null, typical, 'none', null).likely).toBe(typical / 2)
    expect(weeklyGains(null, typical, 'none', 'up').likely).toBe(typical * 0.75)
    expect(weeklyGains(null, typical, 'none', 'down').likely).toBe(0)
  })
})

describe('endurance the long races ask for', () => {
  it('costs nothing up to 15 km', () => {
    expect(enduranceShortfall(10, training({ weeklyKm: 0, longestKm: 0 }))).toBe(0)
  })

  it('costs a marathon up to ten percent without the kilometres', () => {
    expect(enduranceShortfall(42.195, training({ weeklyKm: 0, longestKm: 0 }))).toBeCloseTo(0.1)
    expect(enduranceShortfall(42.195, training({ weeklyKm: 60, longestKm: 32 }))).toBe(0)
  })

  it('costs a half with little volume a little', () => {
    const shortfall = enduranceShortfall(21.0975, training({ weeklyKm: 15, longestKm: 10 }))
    expect(shortfall).toBeGreaterThan(0.005)
    expect(shortfall).toBeLessThan(0.04)
  })
})

describe('the forecast for race day', () => {
  it('is a range around the likely time, faster first', () => {
    const forecast = halfIn(8)
    expect(forecast.best).toBeLessThan(forecast.likely)
    expect(forecast.likely).toBeLessThan(forecast.worst)
  })

  it('adds up from today, the trend, the taper and the endurance', () => {
    const forecast = halfIn(8, { shortfall: 0.02 })
    const { today, trend, taper, endurance } = forecast.parts
    expect(today).toBe(raceSeconds(50, 21097.5))
    expect(trend).toBeLessThan(0)
    expect(taper).toBeLessThan(0)
    expect(endurance).toBeGreaterThan(0)
    expect(Math.abs(today + trend + taper + endurance - forecast.likely)).toBeLessThan(40)
  })

  it('counts no taper where the goal goes without one', () => {
    expect(halfIn(8, { tapered: false }).parts.taper).toBe(0)
  })

  it('grows wider the further out race day is', () => {
    const near = halfIn(2)
    const far = halfIn(20)
    expect(far.worst - far.best).toBeGreaterThan(near.worst - near.best)
  })

  it('grows wider with thinner data', () => {
    const solid = halfIn(4)
    const thin = halfIn(4, { quality: 'none', gains: weeklyGains(null, typical, 'none', null) })
    expect(thin.worst - thin.best).toBeGreaterThan(solid.worst - solid.best)
  })

  it('runs the corridor weekly from today to race day, the taper in the last days', () => {
    const forecast = halfIn(5)
    expect(forecast.corridor[0]?.date).toBe(TODAY)
    expect(forecast.corridor.at(-1)?.date).toBe(forecast.date)
    const beforeTaper = forecast.corridor.find((point) => point.date === addDays(forecast.date, -TAPER_DAYS - 1))
    expect(beforeTaper === undefined || beforeTaper.likely > forecast.likely).toBe(true)
  })

  it('places the goal in the range', () => {
    const forecast = halfIn(8)
    expect(halfIn(8, { goal: forecast.likely + 60 }).goalChance).toBe('likely')
    expect(halfIn(8, { goal: forecast.best + 10 }).goalChance).toBe('possible')
    expect(halfIn(8, { goal: forecast.best - 120 }).goalChance).toBe('out-of-reach')
  })

  it('reads watts the other way round on the bike', () => {
    const forecast = buildForecast(
      {
        today: TODAY,
        date: addDays(TODAY, 56),
        fitness: 250,
        gains: weeklyGains(1, 1.4, 'solid', null),
        quality: 'solid',
        tapered: false,
        shortfall: 0,
        goal: 300,
      },
      rideShape,
    )
    expect(forecast.best).toBeGreaterThan(forecast.likely)
    expect(forecast.likely).toBeGreaterThan(forecast.worst)
    expect(forecast.goalChance).toBe('out-of-reach')
  })
})
