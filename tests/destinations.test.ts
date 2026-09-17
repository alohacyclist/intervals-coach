import { describe, expect, it } from 'vitest'
import { destinationChanges } from '../server/intervals.ts'
import { validateConfig } from '../src/coach/config-schema.ts'
import { config } from './fixtures.ts'

const all = { garmin: true, wahoo: true, zwift: true, coros: false, suunto: false } as const

describe('forwarding per sport', () => {
  it('switches off what this sport should not reach, and on what it should', () => {
    expect(destinationChanges(all, ['garmin'])).toEqual({ wahoo: false, zwift: false })
    expect(destinationChanges(all, ['zwift', 'wahoo', 'coros'])).toEqual({
      garmin: false,
      coros: true,
    })
  })

  it('writes nothing when the switches already match', () => {
    expect(destinationChanges(all, ['garmin', 'wahoo', 'zwift'])).toEqual({})
  })

  it('turns everything off for a sport that goes nowhere', () => {
    expect(destinationChanges(all, [])).toEqual({ garmin: false, wahoo: false, zwift: false })
  })

  it('keeps only sports and platforms it knows', () => {
    const stored = validateConfig({
      ...config,
      destinations: { Run: ['garmin', 'strava'], Ride: ['zwift', 'wahoo'], Golf: ['garmin'] },
    })
    expect(stored.destinations).toEqual({ Ride: ['zwift', 'wahoo'], Run: ['garmin'] })
  })

  it('leaves a sport without an entry alone', () => {
    expect(validateConfig({ ...config, destinations: { Run: [] } }).destinations).toEqual({
      Run: [],
    })
  })
})
