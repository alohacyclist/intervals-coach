import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowanceLow, fetchSportSettings } from '../server/intervals.ts'

afterEach(() => vi.unstubAllGlobals())

describe('the intervals.icu allowance', () => {
  it('is low once less than a tenth of the day is left', () => {
    expect(allowanceLow('625,5000', '600,499')).toBe(true)
    expect(allowanceLow('625,5000', '600,500')).toBe(false)
    expect(allowanceLow('2500,5000', '2400,4990')).toBe(false)
  })

  it('says nothing when the headers are missing or malformed', () => {
    expect(allowanceLow(null, null)).toBe(false)
    expect(allowanceLow('5000', '10')).toBe(false)
    expect(allowanceLow('a,b', 'c,d')).toBe(false)
    expect(allowanceLow('0,0', '0,0')).toBe(false)
  })

  it('warns the operator in the logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('[]', { headers: { 'X-RateLimit-Limit': '625,5000', 'X-RateLimit-Remaining': '20,120' } }),
    )
    await fetchSportSettings({ kind: 'apiKey', apiKey: 'k', athleteId: 'i1' })
    expect(warn).toHaveBeenCalledWith('intervals.icu daily allowance running low', '20,120')
  })
})
