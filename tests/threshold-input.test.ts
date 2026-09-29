import { describe, expect, it } from 'vitest'
import type { SportSetting } from '../src/coach/types.ts'
import {
  prefilledThreshold,
  prefillSports,
  shownText,
  thresholdFromText,
} from '../src/ui/threshold-input.ts'

const settings = { ftp: 287, thresholdPaceSecPerKm: 241, cssSecPer100m: 98, lthr: null, maxHr: null }
const nothing = { ftp: null, thresholdPaceSecPerKm: null, cssSecPer100m: null, lthr: null, maxHr: null }

const defaults: readonly SportSetting[] = [
  { sport: 'Ride', threshold: { metric: 'power', ftp: 250 } },
  { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 270 } },
]

describe('a threshold typed into the form', () => {
  it('reads watts and paces in their own units', () => {
    expect(thresholdFromText('Ride', ' 265 ')).toEqual({ metric: 'power', ftp: 265 })
    expect(thresholdFromText('Run', '4:05')).toEqual({ metric: 'pace', thresholdSecPerKm: 245 })
    expect(thresholdFromText('Swim', '1:52')).toEqual({ metric: 'swimPace', cssSecPer100m: 112 })
  })

  it('refuses empty and garbled values rather than storing zero', () => {
    for (const [sport, text] of [
      ['Ride', ''],
      ['Ride', '0'],
      ['Ride', '250W'],
      ['Run', ''],
      ['Run', '430'],
      ['Swim', 'abc'],
    ] as const) {
      expect([sport, text, thresholdFromText(sport, text)]).toEqual([sport, text, null])
    }
  })
})

describe('what the field shows', () => {
  it('shows the prefilled value once it replaces the default the field was drawn with', () => {
    // The field used to keep showing 250 W, and leaving it wrote 250 back over the real FTP.
    const drawnWith = defaults[0]!.threshold
    const edit = { text: '250', basis: drawnWith }
    const prefilled = prefillSports(defaults, {}, settings).sports[0]!.threshold
    expect(shownText(edit, prefilled)).toBe('287')
  })

  it('keeps what the athlete is typing while nothing else changed the value', () => {
    const threshold = defaults[1]!.threshold
    expect(shownText({ text: '4:3', basis: threshold }, threshold)).toBe('4:3')
    expect(shownText(undefined, threshold)).toBe('4:30')
  })
})

describe('prefilling from intervals.icu', () => {
  it('takes the values intervals.icu has and says so', () => {
    const { sports, sources } = prefillSports(defaults, {}, settings)
    expect(sports.map((setting) => setting.threshold)).toEqual([
      { metric: 'power', ftp: 287 },
      { metric: 'pace', thresholdSecPerKm: 241 },
    ])
    expect(sources).toEqual({ Ride: 'intervals', Run: 'intervals' })
  })

  it('marks a default as an estimate when intervals.icu has nothing', () => {
    const { sports, sources } = prefillSports(defaults, {}, nothing)
    expect(sports).toEqual(defaults)
    expect(sources).toEqual({ Ride: 'estimate', Run: 'estimate' })
    expect(prefillSports(defaults, {}, null).sources).toEqual({ Ride: 'estimate', Run: 'estimate' })
  })

  it('never overwrites a value the athlete typed before the prefill arrived', () => {
    const typed: readonly SportSetting[] = [{ sport: 'Ride', threshold: { metric: 'power', ftp: 301 } }, defaults[1]!]
    const { sports, sources } = prefillSports(typed, { Ride: 'own' }, settings)
    expect(sports[0]?.threshold).toEqual({ metric: 'power', ftp: 301 })
    expect(sources).toEqual({ Ride: 'own', Run: 'intervals' })
  })

  it('gives a sport switched on later the intervals.icu value where there is one', () => {
    expect(prefilledThreshold('Ride', settings)).toEqual({
      threshold: { metric: 'power', ftp: 287 },
      source: 'intervals',
    })
    expect(prefilledThreshold('Run', nothing).source).toBe('estimate')
  })
})
