import { describe, expect, it } from 'vitest'
import { goalOptions, relabel } from '../src/coach/goal-options.ts'
import { typicalGainPerWeek } from '../src/coach/feasibility.ts'
import type { Feasibility, Goal, SportStanding } from '../src/coach/types.ts'
import { addDays } from '../src/coach/dates.ts'
import { TODAY } from './fixtures.ts'

const ftpGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'ftp',
  sport: 'Ride',
  kind: 'ftp',
  label: 'FTP 300 W',
  targetValue: 300,
  currentValue: 260,
  targetDate: addDays(TODAY, 70),
  priority: 'A',
  ...overrides,
})

const tenK = (overrides: Partial<Goal> = {}): Goal => ({
  id: '10k',
  sport: 'Run',
  kind: 'raceTime',
  label: '10 km unter 36:00',
  targetValue: 2160,
  currentValue: 2400,
  distanceKm: 10,
  targetDate: addDays(TODAY, 70),
  priority: 'A',
  ...overrides,
})

const standingFor = (goal: Goal, overrides: Partial<SportStanding> = {}): SportStanding => ({
  sport: goal.sport,
  measure: goal.kind === 'ftp' ? 'ftp' : 'race',
  distanceKm: goal.distanceKm ?? null,
  current: goal.currentValue,
  change: null,
  series: [],
  goal: { id: goal.id, value: goal.targetValue, date: goal.targetDate ?? null },
  trendPerWeek: null,
  reachBy: null,
  verdict: 'late',
  source: 'eftp',
  ...overrides,
})

describe('ways out for a goal that will not happen as set', () => {
  it('offers the target the date allows and the date the target needs, from the trend', () => {
    const goal = ftpGoal()
    // 1.2 W a week: below twice the typical gain for 260 W (about 3 W).
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: 1.2 })], [], TODAY)
    expect(option).toMatchObject({ goalId: 'ftp', basis: 'trend', perWeek: 1.2, current: 260 })
    // Ten weeks at 1.2 W: 272 W, offered as 270.
    expect(option?.value).toEqual({ targetValue: 270, label: 'FTP 270 W' })
    // 40 W at 1.2 W a week: 34 weeks.
    expect(option?.date).toEqual({ targetDate: addDays(TODAY, 34 * 7) })
  })

  it('leans on no more than twice the typical gain', () => {
    const goal = ftpGoal()
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: 20 })], [], TODAY)
    expect(option?.perWeek).toBeCloseTo(2 * typicalGainPerWeek(goal, 260), 1)
  })

  it('falls back to typical progress where the trend does not rise, and says so', () => {
    const goal = ftpGoal()
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: -0.5, verdict: 'stalled' })], [], TODAY)
    expect(option?.basis).toBe('typical')
    expect(option?.perWeek).toBeCloseTo(typicalGainPerWeek(goal, 260), 1)
  })

  it('leaves a goal on track alone', () => {
    const goal = ftpGoal()
    expect(goalOptions([goal], [standingFor(goal, { trendPerWeek: 5, verdict: 'on-track' })], [], TODAY)).toEqual([])
  })

  it('offers a race time rounded to the slower quarter minute, with the name following it', () => {
    const goal = tenK()
    // Five seconds a week over ten weeks: 2400 → 2350, offered as 2355 (39:15).
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: -5 })], [], TODAY)
    expect(option?.value).toEqual({ targetValue: 2355, label: '10 km unter 39:15' })
  })

  it('offers only a date for a goal without one', () => {
    const goal = ftpGoal({ targetDate: undefined })
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: 2, verdict: null })], [], TODAY)
    expect(option?.value).toBeNull()
    expect(option?.date).toEqual({ targetDate: addDays(TODAY, 20 * 7) })
  })

  it('reads the realism check where no standing covers the goal', () => {
    const goal = tenK({ sport: 'Swim', id: 'swim', label: '1500 m in 24:00', distanceKm: 1.5, targetValue: 1440, currentValue: 1560 })
    const feasibility: Feasibility = { goalId: 'swim', verdict: 'unrealistic', currentValue: 1560, weeksLeft: 10, message: '' }
    const [option] = goalOptions([goal], [], [feasibility], TODAY)
    expect(option?.basis).toBe('typical')
    expect(option?.value?.label).toMatch(/^1500 m in \d+:\d\d$/)
  })

  it('has nothing to offer once the goal sits where the progress puts it', () => {
    const goal = ftpGoal()
    const [first] = goalOptions([goal], [standingFor(goal, { trendPerWeek: 1.2 })], [], TODAY)
    const moved = { ...goal, targetDate: first!.date!.targetDate }
    expect(goalOptions([moved], [standingFor(moved, { trendPerWeek: 1.2 })], [], TODAY)).toEqual([])
  })

  it('never offers a higher bar than the one set', () => {
    const goal = ftpGoal({ targetValue: 265 })
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: 1.2 })], [], TODAY)
    expect(option?.value).toBeNull()
  })

  it('names no date further out than two years', () => {
    const goal = ftpGoal({ targetValue: 400 })
    const [option] = goalOptions([goal], [standingFor(goal, { trendPerWeek: 1 })], [], TODAY)
    expect(option?.date).toBeNull()
    expect(option?.value).not.toBeNull()
  })
})

describe('the name of an adjusted goal', () => {
  it('follows the watts it names', () => {
    expect(relabel(ftpGoal({ label: 'FTP 300W' }), 290)).toBe('FTP 290W')
  })

  it('follows a race time it names, also in whole minutes', () => {
    expect(relabel(tenK(), 2190)).toBe('10 km unter 36:30')
    expect(relabel(tenK({ label: '10km sub 36' }), 2190)).toBe('10km sub 36:30')
  })

  it('stays a name of the athlete’s own', () => {
    expect(relabel(ftpGoal({ label: 'Stärker am Berg' }), 290)).toBe('Stärker am Berg')
  })
})
