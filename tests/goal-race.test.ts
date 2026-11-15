import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { phaseForSport, primaryGoal, seasonBand } from '../src/coach/phase.ts'
import type { CoachConfig, Goal } from '../src/coach/types.ts'
import { TODAY, activity, baselineWellness, config, wellness } from './fixtures.ts'

const rested = buildState(
  [activity(9, 'Ride', { load: 60, intensity: 70 }), activity(11, 'Run', { load: 50, intensity: 70 })],
  [wellness(0), ...baselineWellness()],
  TODAY,
)

/** A side race in December, three weeks before the main goal's season would let it matter. */
const nikolauslauf = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'nikolaus',
  sport: 'Run',
  kind: 'raceTime',
  label: 'Nikolauslauf',
  targetValue: 2279,
  currentValue: 2353,
  distanceKm: 10,
  targetDate: '2026-12-06',
  priority: 'B',
  ...overrides,
})

const withGoals = (...extra: readonly Goal[]): CoachConfig => ({ ...config, goals: [...config.goals, ...extra] })

describe('a side goal', () => {
  it('leaves the main goal leading, however near it is', () => {
    expect(primaryGoal(withGoals(nikolauslauf({ targetDate: '2026-09-10' })).goals, TODAY)?.id).toBe('ftp-300')
  })

  it('takes no block from the main goal in its sport', () => {
    const plain = config
    const raced = withGoals(nikolauslauf())
    for (const date of ['2026-11-16', '2026-11-25', '2026-12-04']) {
      expect([date, phaseForSport(raced, 'Run', date)]).toEqual([date, phaseForSport(plain, 'Run', date)])
    }
  })

  it('draws no season band of its own', () => {
    const band = seasonBand(withGoals(nikolauslauf({ targetDate: '2026-09-20' })), TODAY)
    expect(band.length).toBeGreaterThan(3)
  })
})

describe('the days around a race goal', () => {
  // Wednesday today, the race on Saturday.
  const saturday = nikolauslauf({ targetDate: '2026-09-05' })

  it('is raced on its day, and the race is the only session', () => {
    const days = planDays(rested, withGoals(saturday), 4)
    const race = days[3]!
    expect(race.date).toBe('2026-09-05')
    expect(race.dayType).toBe('KEY')
    expect(race.recommended).toBe('Run')
    expect(race.options.map((option) => option.template.id)).toEqual(['goal-race'])
    expect(race.options[0]!.template.minutes).toBeGreaterThan(50)
    expect(race.strength).toBeNull()
  })

  it('keeps every sport easy the day before, with openers in the race sport', () => {
    const eve = planDays(rested, withGoals(saturday), 4)[2]!
    expect(eve.dayType).toBe('EASY')
    expect(eve.recommended).toBe('Run')
    expect(eve.options.find((option) => option.sport === 'Run')?.template.id).toBe('run-race-openers')
    for (const option of eve.options) expect(option.template.stimulus).not.toMatch(/VO2|THRESHOLD|SWEETSPOT/)
  })

  it('allows no hard session in any sport two days before', () => {
    const days = planDays(rested, withGoals(saturday), 4)
    expect(days.slice(1, 3).map((day) => day.dayType)).not.toContain('KEY')
  })

  it('without taper fixes the race day alone', () => {
    const days = planDays(rested, withGoals({ ...saturday, taper: false }), 4)
    expect(days[3]!.options.map((option) => option.template.id)).toEqual(['goal-race'])
    expect(days[2]!.options.map((option) => option.template.id)).not.toContain('run-race-openers')
    expect(days[2]!.options.map((option) => option.reason).join(' ')).not.toContain('Nikolauslauf')
  })

  it('keeps the next day free of hard work in every sport', () => {
    const tomorrow = nikolauslauf({ targetDate: '2026-09-03' })
    const days = planDays(rested, withGoals(tomorrow), 3)
    expect(days[1]!.dayType).toBe('KEY')
    expect(days[2]!.dayType).not.toBe('KEY')
  })
})

describe('a main goal’s taper', () => {
  it('is a taper week in every sport', () => {
    // The FTP goal is on 30 November; the run's own goal is in May.
    expect(phaseForSport(config, 'Ride', '2026-11-27')).toBe('TAPER')
    expect(phaseForSport(config, 'Run', '2026-11-27')).toBe('TAPER')
  })

  it('can be switched off', () => {
    const untapered: CoachConfig = {
      ...config,
      goals: config.goals.map((goal) => (goal.id === 'ftp-300' ? { ...goal, taper: false } : goal)),
    }
    expect(phaseForSport(untapered, 'Ride', '2026-11-27')).toBe('SPECIFIC')
    expect(phaseForSport(untapered, 'Run', '2026-11-27')).not.toBe('TAPER')
  })

  it('ends with the goal day', () => {
    expect(phaseForSport(config, 'Ride', '2026-11-30')).toBe('TAPER')
    expect(phaseForSport(config, 'Ride', '2026-12-01')).not.toBe('TAPER')
    expect(primaryGoal(config.goals, '2026-12-01')?.id).toBe('10k-sub36')
  })
})

describe('the stored goal', () => {
  it('keeps a taper switched off, and leaves the field out otherwise', async () => {
    const { validateConfig } = await import('../src/coach/config-schema.ts')
    const stored = validateConfig({ ...config, goals: [nikolauslauf({ taper: false }), nikolauslauf({ id: 'on' })] })
    expect(stored.goals[0]?.taper).toBe(false)
    expect(stored.goals[1]).not.toHaveProperty('taper')
  })
})
