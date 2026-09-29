import { describe, expect, it } from 'vitest'
import { zrlRelevant } from '../src/ui/zrl-relevance.ts'
import { buildState } from '../src/coach/state.ts'
import type { CoachConfig, DestinationState } from '../src/coach/types.ts'
import { activity, config, TODAY } from './fixtures.ts'

const state = buildState([activity(3, 'Ride')], [], TODAY)
const garminOnly: readonly DestinationState[] = [
  { destination: 'garmin', label: 'Garmin', enabled: true, connected: true },
  { destination: 'zwift', label: 'Zwift', enabled: false, connected: false },
]
const zwiftLinked: readonly DestinationState[] = [
  { destination: 'zwift', label: 'Zwift', enabled: false, connected: true },
]

describe('zrlRelevant', () => {
  it('hides the league for an athlete with no sign of Zwift', () => {
    expect(zrlRelevant(config, state, garminOnly)).toBe(false)
  })

  it('shows it once Zwift is linked in intervals.icu', () => {
    expect(zrlRelevant(config, state, zwiftLinked)).toBe(true)
  })

  it('shows it when workouts already go to Zwift', () => {
    expect(zrlRelevant({ ...config, destinations: { Ride: ['zwift'] } }, state, garminOnly)).toBe(true)
  })

  it('keeps it for a league already set up, so it can be switched off again', () => {
    expect(zrlRelevant({ ...config, zrl: { enabled: true, taper: true } }, state, garminOnly)).toBe(true)
  })

  it('shows it after a league race was ridden', () => {
    const raced = { ...state, raceHistory: [{ date: TODAY, teamTimeTrial: false, minutes: 40, distanceKm: 25, elevationM: 200, intensity: 95, load: 60 }] }
    expect(zrlRelevant(config, raced, garminOnly)).toBe(true)
  })

  it('never shows it to an athlete who does not ride', () => {
    const runner: CoachConfig = {
      ...config,
      profile: { ...config.profile, sports: config.profile.sports.filter((setting) => setting.sport !== 'Ride') },
    }
    expect(zrlRelevant(runner, state, zwiftLinked)).toBe(false)
  })
})
