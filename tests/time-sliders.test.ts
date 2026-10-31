import { describe, expect, it } from 'vitest'
import { coreStartStops, moreTimeStops } from '../src/ui/components/MoreTimeSlider.tsx'

describe('the time sliders', () => {
  it('offers more time from the usual ceiling up to five hours, in quarter hours', () => {
    const stops = moreTimeStops(75)
    expect(stops.slice(0, 3)).toEqual([75, 90, 105])
    expect(stops.at(-1)).toBe(300)
  })

  it('lets the work begin right after the warm-up or at any quarter hour up to the latest', () => {
    expect(coreStartStops(80)).toEqual([undefined, 30, 45, 60, 75])
    expect(coreStartStops(29)).toEqual([undefined])
  })
})
