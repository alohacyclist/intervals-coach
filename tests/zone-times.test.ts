import { describe, expect, it } from 'vitest'
import { mapZoneTimes } from '../server/intervals.ts'
import { inferStimulus, isHardActivity } from '../src/coach/fitness.ts'
import { activity } from './fixtures.ts'

describe('reading time in zone', () => {
  it('keeps the ids power zones come with', () => {
    expect(
      mapZoneTimes([
        { id: 'Z1', secs: 840 },
        { id: 'Z4', secs: 1440 },
        { id: 'SS', secs: 1440 },
        { id: 'Z6', secs: 0 },
      ]),
    ).toEqual({ Z1: 840, Z4: 1440, SS: 1440 })
  })

  it('reads heart rate zones, where the position is the zone', () => {
    // A runner has no power meter, so this is the only shape their zones arrive in.
    expect(mapZoneTimes([787, 80, 160, 293, 308, 103, 0])).toEqual({
      Z1: 787,
      Z2: 80,
      Z3: 160,
      Z4: 293,
      Z5: 308,
      Z6: 103,
    })
  })

  it('has nothing to say about a missing or malformed field', () => {
    expect(mapZoneTimes(undefined)).toEqual({})
    expect(mapZoneTimes([])).toEqual({})
  })
})

const shortRun = (zoneSeconds: Record<string, number>) =>
  activity(1, 'Run', { load: 34, intensity: 83, movingTimeSec: 1737, zoneSeconds })

describe('a short run with real intervals in it', () => {
  it('counts as a key session on seven minutes above threshold', () => {
    const run = shortRun({ Z1: 787, Z2: 80, Z3: 160, Z4: 293, Z5: 308, Z6: 103 })
    expect(inferStimulus(run)).toBe('VO2')
    expect(isHardActivity(run)).toBe(true)
  })

  it('is only a brisk run when nothing proves otherwise', () => {
    // Same load and average intensity, no zone data: the evidence is gone, so the
    // minimum load has to stand in for it.
    const run = shortRun({})
    expect(isHardActivity(run)).toBe(false)
  })
})
