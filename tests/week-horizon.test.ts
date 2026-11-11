import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays } from '../src/coach/dates.ts'
import { TODAY, activity, baselineWellness, config, triConfig, wellness } from './fixtures.ts'

const rested = [
  activity(9, 'Ride', { load: 60, intensity: 70 }),
  activity(11, 'Run', { load: 50, intensity: 70 }),
]
const state = buildState(rested, [wellness(0), ...baselineWellness()], TODAY)

/** The whole week ahead has to obey what the three days do: the rules do not stop at day three. */
describe('a plan seven days ahead', () => {
  for (const [name, athlete] of [['bike and run', config], ['three sports', triConfig]] as const) {
    const week = planDays(state, athlete, 7)

    it(`covers seven consecutive days (${name})`, () => {
      expect(week.map((day) => day.date)).toEqual(Array.from({ length: 7 }, (_unused, index) => addDays(TODAY, index)))
    })

    it(`never sets two quality days in a row (${name})`, () => {
      week.slice(1).forEach((day, index) => {
        expect([week[index]?.dayType, day.dayType]).not.toEqual(['KEY', 'KEY'])
      })
    })

    it(`never rests three days in a row (${name})`, () => {
      week.slice(2).forEach((day, index) => {
        const run = [week[index], week[index + 1], day].map((entry) => entry?.recommended)
        expect(run).not.toEqual(['REST', 'REST', 'REST'])
      })
    })

    it(`starts with the same three days as the short plan (${name})`, () => {
      expect(week.slice(0, 3)).toEqual(planDays(state, athlete, 3))
    })
  }
})
