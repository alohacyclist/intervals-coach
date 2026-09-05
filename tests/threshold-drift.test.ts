import { describe, expect, it } from 'vitest'
import { adoptThreshold, thresholdSuggestions } from '../src/coach/threshold-drift.ts'
import { config, triConfig } from './fixtures.ts'

const profile = triConfig.profile

describe('threshold drift', () => {
  it('stays quiet while the numbers agree', () => {
    expect(thresholdSuggestions(profile, { Ride: 282, Run: 238 })).toEqual([])
  })

  it('reports a lower measured FTP as a harder than intended plan', () => {
    const [suggestion] = thresholdSuggestions(config.profile, { Ride: 264 })
    expect(suggestion?.driftPercent).toBeCloseTo(-5.7, 1)
    expect(suggestion?.message).toContain('zu hart')
  })

  it('reports a higher measured FTP as a plan gone too easy', () => {
    const [suggestion] = thresholdSuggestions(config.profile, { Ride: 305 })
    expect(suggestion?.driftPercent).toBeGreaterThan(0)
    expect(suggestion?.message).toContain('zu leicht')
  })

  it('treats a faster measured pace as an improvement', () => {
    // 236 s/km configured, 220 measured — faster, so the plan is too easy.
    const [suggestion] = thresholdSuggestions(config.profile, { Run: 220 })
    expect(suggestion?.driftPercent).toBeGreaterThan(0)
    expect(suggestion?.message).toContain('/km')
  })

  it('ignores sports the athlete does not train', () => {
    expect(thresholdSuggestions(config.profile, { Swim: 200 })).toEqual([])
  })

  it('ignores missing or zero measurements', () => {
    expect(thresholdSuggestions(config.profile, { Ride: 0 })).toEqual([])
    expect(thresholdSuggestions(config.profile, {})).toEqual([])
  })

  it('adopts one sport and leaves the others alone', () => {
    const updated = adoptThreshold(config.profile, 'Ride', 264.4)
    expect(updated.sports[0]?.threshold).toEqual({ metric: 'power', ftp: 264 })
    expect(updated.sports[1]).toEqual(config.profile.sports[1])
  })

  it('adopts a swim threshold in its own unit', () => {
    const updated = adoptThreshold(profile, 'Swim', 104)
    expect(updated.sports[2]?.threshold).toEqual({ metric: 'swimPace', cssSecPer100m: 104 })
  })
})
