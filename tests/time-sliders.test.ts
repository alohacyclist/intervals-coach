import { describe, expect, it } from 'vitest'
import { coreStartStops, moreTimeStops } from '../src/ui/components/MoreTimeSlider.tsx'

describe('the time sliders', () => {
  it('offers more time from the usual ceiling up to five hours, in five minutes', () => {
    const stops = moreTimeStops(75)
    expect(stops.slice(0, 3)).toEqual([75, 80, 85])
    expect(moreTimeStops(72).slice(0, 3)).toEqual([72, 75, 80])
    expect(stops.at(-1)).toBe(300)
  })

  it('lets the work begin right after the warm-up or every five minutes up to the latest', () => {
    expect(coreStartStops(37)).toEqual([undefined, 15, 20, 25, 30, 35])
    expect(coreStartStops(14)).toEqual([undefined])
  })
})
