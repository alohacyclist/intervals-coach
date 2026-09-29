import { describe, expect, it } from 'vitest'
import { parseTime, timeError } from '../src/ui/format-input.ts'
import { formatClock } from '../src/coach/dates.ts'

describe('reading a typed time', () => {
  it('reads minutes and seconds', () => {
    expect(parseTime('38:30')).toBe(2310)
    expect(parseTime(' 4:05 ')).toBe(245)
  })

  it('reads hours for a half marathon, not minutes', () => {
    // Read as mm:ss this used to become 105 seconds.
    expect(parseTime('1:45:00')).toBe(6300)
    expect(parseTime('5:30:00')).toBe(19800)
  })

  it('keeps minutes beyond an hour when that is how it was typed', () => {
    expect(parseTime('105:00')).toBe(6300)
  })

  it('refuses what is not a time instead of turning it into zero', () => {
    for (const value of ['', '   ', '38', 'abc', '38:', ':30', '38:75', '1:60:00', '1:2:3:4', '0:00', '-1:00', '38,30']) {
      expect([value, parseTime(value)]).toEqual([value, null])
    }
  })

  it('says what is wrong right at the field', () => {
    expect(timeError('', false)).toBeNull()
    expect(timeError('', true)).toContain('eintragen')
    expect(timeError('1:45', true)).toBeNull()
    expect(timeError('145', true)).toContain('h:mm:ss')
  })
})

describe('writing a race time', () => {
  it('shows hours once there are any', () => {
    expect(formatClock(2310)).toBe('38:30')
    expect(formatClock(6300)).toBe('1:45:00')
    expect(formatClock(3605)).toBe('1:00:05')
  })

  it('reads back what it writes', () => {
    for (const seconds of [59, 2310, 3600, 6300, 19800]) {
      expect(parseTime(formatClock(seconds))).toBe(seconds)
    }
  })
})
