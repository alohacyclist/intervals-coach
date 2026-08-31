import { describe, expect, it } from 'vitest'
import { addDays, diffDays, formatSeconds, startOfWeek, weekdayDe, weeksBetween } from '../src/coach/dates.ts'

describe('dates', () => {
  it('adds and subtracts days across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('computes signed day differences', () => {
    expect(diffDays('2026-08-01', '2026-08-31')).toBe(30)
    expect(diffDays('2026-08-31', '2026-08-01')).toBe(-30)
  })

  it('anchors weeks on monday', () => {
    expect(startOfWeek('2026-08-31')).toBe('2026-08-31')
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31')
    expect(weekdayDe('2026-08-31')).toBe('Mo')
  })

  it('floors whole weeks and never goes negative', () => {
    expect(weeksBetween('2026-08-31', '2026-09-13')).toBe(1)
    expect(weeksBetween('2026-09-13', '2026-08-31')).toBe(0)
  })

  it('formats pace as mm:ss', () => {
    expect(formatSeconds(236)).toBe('3:56')
    expect(formatSeconds(3.4)).toBe('0:03')
  })

  it('rejects malformed dates', () => {
    expect(() => addDays('nonsense', 1)).toThrow()
  })
})
