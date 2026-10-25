import { describe, expect, it } from 'vitest'
import { mapPaceZoneTimes, mapZoneTimes } from '../server/intervals.ts'
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

describe('reading a run by its pace', () => {
  it('puts the default pace zones where the run library has them', () => {
    // Z1 and Z2 easy, Z3 tempo, Z4 and Z5a threshold, Z5b and Z5c VO2max.
    expect(mapPaceZoneTimes([600, 900, 120, 300, 420, 60, 30], undefined)).toEqual({
      Z2: 1500,
      Z3: 120,
      Z4: 720,
      Z5: 90,
    })
  })

  it('follows the zones the athlete set', () => {
    expect(mapPaceZoneTimes([600, 200, 300, 400], [80, 96, 106, 999])).toEqual({ Z2: 600, Z3: 200, Z4: 300, Z5: 400 })
  })

  it('falls back to the default zones when the athlete set none, and gives up when they do not fit', () => {
    expect(mapPaceZoneTimes([0, 0, 0, 500, 0, 0, 0], [])).toEqual({ Z4: 500 })
    expect(mapPaceZoneTimes([100, 200], undefined)).toEqual({})
    expect(mapPaceZoneTimes(undefined, undefined)).toEqual({})
  })

  it('makes a 3x1km threshold run hard even when the heart rate was not recorded', () => {
    // The pace of a 3x1km: warm-up and recoveries easy, three kilometres at 100-104 %.
    const run = activity(0, 'Run', {
      load: 43,
      movingTimeSec: 34 * 60,
      zoneSeconds: mapPaceZoneTimes([700, 500, 80, 200, 520, 40, 0], undefined),
    })
    expect(inferStimulus(run)).toBe('THRESHOLD')
    expect(isHardActivity(run)).toBe(true)
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
