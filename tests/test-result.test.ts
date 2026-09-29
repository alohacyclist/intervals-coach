import { describe, expect, it } from 'vitest'
import { cssFromTest, thresholdFromTest } from '../src/coach/test-result.ts'
import { thresholdTestFor } from '../src/coach/library.ts'
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

const swim = (metres: number, seconds: number) => ({
  seconds,
  averageWatts: null,
  averageSpeedMps: metres / seconds,
})
const wall = (seconds: number) => ({ seconds, averageWatts: null, averageSpeedMps: null })

describe('reading CSS off the 400/200 test', () => {
  // 400 m in 6:40 and 200 m in 3:10: the extra 200 m took 210 s, so CSS is 1:45/100 m.
  it('takes half the time difference as the pace per 100 m', () => {
    const test = [
      swim(400, 500),
      ...[1, 2, 3, 4].flatMap(() => [swim(50, 53), wall(20)]),
      swim(400, 400),
      swim(200, 250),
      swim(200, 190),
      swim(200, 250),
    ]
    expect(cssFromTest(test)).toBe(105)
    expect(thresholdFromTest('Swim', test)).toEqual({ metric: 'swimPace', value: 105 })
  })

  it('finds both efforts when they come back in lengths, with the easy swim typed as work', () => {
    const test = [
      swim(400, 500),
      ...Array.from({ length: 8 }, () => swim(50, 50)),
      ...Array.from({ length: 4 }, () => swim(50, 62)),
      ...Array.from({ length: 4 }, () => swim(50, 47.5)),
      swim(200, 250),
    ]
    expect(cssFromTest(test)).toBe(105)
  })

  it('reads a slower club swimmer just as well', () => {
    // 400 m in 8:20, 200 m in 3:58: CSS 2:11/100 m.
    expect(cssFromTest([swim(400, 500), wall(300), swim(200, 238)])).toBe(131)
  })

  it('says nothing when one of the two efforts is missing', () => {
    expect(cssFromTest([swim(400, 400), swim(200, 250)].slice(0, 1))).toBeNull()
    expect(cssFromTest([swim(200, 190)])).toBeNull()
    expect(cssFromTest([])).toBeNull()
  })

  it('says nothing when the 200 was not the quicker pace, which would be no test', () => {
    expect(cssFromTest([swim(400, 400), wall(300), swim(200, 205)])).toBeNull()
  })

  it('has nothing to read from a swim without speed', () => {
    expect(cssFromTest([wall(400), wall(190)])).toBeNull()
  })

  it('is what the plan schedules to measure swimming', () => {
    expect(thresholdTestFor('Swim')?.id).toBe('test-swim-css')
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
