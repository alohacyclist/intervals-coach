import { describe, expect, it } from 'vitest'
import { isRecoveryWeek, phaseForSport, primaryGoal, weeklyHardBudget, weeksToGoal } from '../src/coach/phase.ts'
import { addDays, startOfWeek, weekdayDe } from '../src/coach/dates.ts'
import { config } from './fixtures.ts'

describe('periodization', () => {
  it('picks the goal with the nearest date as primary', () => {
    expect(primaryGoal(config.goals, '2026-08-31')?.id).toBe('ftp-300')
  })

  it('ignores goals whose date has passed', () => {
    expect(primaryGoal(config.goals, '2026-12-15')?.id).toBe('10k-sub36')
  })

  it('returns null weeks for open ended goals', () => {
    const goal = { ...config.goals[0]!, targetDate: undefined }
    expect(weeksToGoal(goal, '2026-08-31')).toBeNull()
  })

  it('moves through base, build, specific and taper as the date approaches', () => {
    expect(phaseForSport(config, 'Ride', '2026-08-31')).toBe('BASE')
    expect(phaseForSport(config, 'Ride', '2026-09-28')).toBe('BUILD')
    expect(phaseForSport(config, 'Ride', '2026-11-10')).toBe('SPECIFIC')
    expect(phaseForSport(config, 'Ride', '2026-11-27')).toBe('TAPER')
  })

  it('inserts a recovery week every fourth week', () => {
    expect(isRecoveryWeek('2026-08-31', '2026-09-01')).toBe(false)
    expect(isRecoveryWeek('2026-08-31', '2026-09-22')).toBe(true)
    expect(phaseForSport(config, 'Run', '2026-09-22')).toBe('RECOVERY')
  })

  /**
   * A plan started on a Thursday used to put its recovery block on Thursday to
   * Wednesday, so the athlete met an easy week, then met it again on Monday.
   */
  it('keeps the recovery week inside one calendar week, whatever day the plan started', () => {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const planStart = addDays('2026-06-01', weekday)
      const weeks = new Map<string, number>()
      for (let offset = 0; offset < 112; offset += 1) {
        const date = addDays(planStart, offset)
        if (!isRecoveryWeek(planStart, date)) continue
        const week = startOfWeek(date)
        weeks.set(week, (weeks.get(week) ?? 0) + 1)
      }
      // Whole weeks only, and never two of them back to back.
      const starts = [...weeks.keys()].sort()
      for (const [week, days] of weeks) {
        expect({ planStart: weekdayDe(planStart), week, days }).toEqual({
          planStart: weekdayDe(planStart),
          week,
          days: 7,
        })
      }
      for (let index = 1; index < starts.length; index += 1) {
        expect(addDays(starts[index - 1]!, 7)).not.toBe(starts[index])
      }
    }
  })

  it('holds one phase for a whole calendar week when the goal is open ended', () => {
    const openEnded = {
      ...config,
      planStart: '2026-06-04', // ein Donnerstag
      goals: config.goals.map((goal) => ({ ...goal, targetDate: undefined })),
    }

    for (let week = 0; week < 12; week += 1) {
      const monday = addDays('2026-06-01', week * 7)
      const phases = new Set(
        Array.from({ length: 7 }, (_, day) => phaseForSport(openEnded, 'Ride', addDays(monday, day))),
      )
      expect([monday, [...phases]]).toEqual([monday, [...phases].slice(0, 1)])
    }

    // Und die Blöcke wechseln auch wirklich, statt überall dasselbe zu liefern.
    const seen = new Set(
      Array.from({ length: 12 }, (_, week) =>
        phaseForSport(openEnded, 'Ride', addDays('2026-06-01', week * 7)),
      ),
    )
    expect([...seen].sort()).toEqual(['BASE', 'BUILD', 'RECOVERY'])
  })

  it('caps the hard budget by weekly volume', () => {
    expect(weeklyHardBudget('BUILD', config.profile)).toBe(2)
    expect(weeklyHardBudget('BUILD', { ...config.profile, weeklySessions: { min: 4, max: 6 } })).toBe(3)
    expect(weeklyHardBudget('RECOVERY', config.profile)).toBe(1)
  })
})
