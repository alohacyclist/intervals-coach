import { describe, expect, it } from 'vitest'
import { isRecoveryWeek, phaseForSport, primaryGoal, weeklyHardBudget, weeksToGoal } from '../src/coach/phase.ts'
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

  it('caps the hard budget by weekly volume', () => {
    expect(weeklyHardBudget('BUILD', config.profile)).toBe(2)
    expect(weeklyHardBudget('BUILD', { ...config.profile, weeklySessions: 6 })).toBe(3)
    expect(weeklyHardBudget('RECOVERY', config.profile)).toBe(1)
  })
})
