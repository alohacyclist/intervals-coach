import { describe, expect, it } from 'vitest'
import { thresholdFromTest } from '../src/coach/test-result.ts'
import { measuredSuggestion } from '../src/coach/threshold-drift.ts'
import { config } from './fixtures.ts'

const effort = (minutes: number, watts: number | null, speed: number | null = null) => ({
  seconds: minutes * 60,
  averageWatts: watts,
  averageSpeedMps: speed,
})

describe('reading a threshold off the test', () => {
  it('takes ninety five percent of twenty minutes all out', () => {
    expect(thresholdFromTest('Ride', [effort(20, 300)])).toEqual({ metric: 'power', value: 285 })
  })

  it('ignores the openers and reads the sustained block', () => {
    const test = [effort(1, 320), effort(1, 120), effort(1, 315), effort(1, 120), effort(20, 300)]
    expect(thresholdFromTest('Ride', test)?.value).toBe(285)
  })

  it('finds the block even when it comes back cut into pieces', () => {
    // intervals.icu detects intervals from the data, so a twenty minute block
    // arrives as five four minute ones with the recoveries typed as work too.
    const test = [
      effort(6, 150),
      effort(4, 300),
      effort(4, 302),
      effort(4, 298),
      effort(4, 301),
      effort(4, 299),
      effort(7, 140),
    ]
    expect(thresholdFromTest('Ride', test)?.value).toBe(285)
  })

  it('says nothing when there was never fifteen minutes of it', () => {
    expect(thresholdFromTest('Ride', [effort(8, 320), effort(4, 318)])).toBeNull()
    expect(thresholdFromTest('Ride', [])).toBeNull()
  })

  it('turns a running test into a threshold pace, which is slower than test pace', () => {
    // 4.0 m/s is 4:10/km, so the threshold pace lands a shade above four twenty.
    const measured = thresholdFromTest('Run', [effort(20, null, 4)])
    expect(measured?.metric).toBe('pace')
    expect(measured?.value).toBe(263)
  })

  it('has nothing to read from a ride without power', () => {
    expect(thresholdFromTest('Ride', [effort(20, null, 9)])).toBeNull()
  })
})

describe('what the app does with the number', () => {
  it('always says adopt, because it was measured and not inferred', () => {
    const suggestion = measuredSuggestion(config.profile, 'Ride', 292)
    expect(suggestion?.action).toBe('adopt')
    expect(suggestion?.observed).toBe(292)
    expect(suggestion?.message).toContain('gemessen, nicht geschätzt')
  })

  it('reports a drop just as plainly as a gain', () => {
    const suggestion = measuredSuggestion(config.profile, 'Ride', 240)
    expect(suggestion?.action).toBe('adopt')
    expect(suggestion?.driftPercent).toBeLessThan(0)
  })

  it('has nothing to say about a sport the athlete does not train', () => {
    expect(measuredSuggestion(config.profile, 'Swim', 100)).toBeNull()
  })
})
