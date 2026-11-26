import { describe, expect, it } from 'vitest'
import type { Activity, AthleteProfile, Phase, TrainingBreak } from '../src/coach/types.ts'
import { CTL_DAYS, PLATEAU_GAIN } from '../src/coach/fitness.ts'
import { EASY_LOAD_PER_HOUR, fitnessCeiling } from '../src/coach/ceiling.ts'
import { buildProgress } from '../src/coach/progress.ts'
import { addDays } from '../src/coach/dates.ts'
import { activity, config, TODAY } from './fixtures.ts'

/** Four sessions a week at most, an hour and a half each: six hours. */
const profile: AthleteProfile = {
  ...config.profile,
  weeklySessions: { min: 3, max: 4 },
  sessionMinutes: { min: 30, normal: 60, max: 90 },
}

type Context = { readonly profile: AthleteProfile; readonly breaks: readonly TrainingBreak[]; readonly phase: Phase }

const context: Context = { profile, breaks: [], phase: 'BUILD' }

/** A session every `every` days back to `days` ago, the newest yesterday. */
const steady = (
  days: number,
  every: number,
  load: (daysAgo: number) => number,
  minutes = 50,
): readonly Activity[] =>
  Array.from({ length: Math.floor(days / every) }, (_unused, index) => 1 + index * every).map((daysAgo, index) =>
    activity(daysAgo, index % 2 === 0 ? 'Ride' : 'Run', {
      id: `s-${daysAgo}`,
      load: load(daysAgo),
      movingTimeSec: minutes * 60,
    }),
  )

const ceilingOf = (activities: readonly Activity[], setup: Context = context) => {
  const progress = buildProgress(activities, [], TODAY, 90, 13, {
    feasibility: [],
    sports: [],
    ceiling: setup,
  })
  return { progress, ceiling: progress.ceiling }
}

describe('where fitness levels off', () => {
  // Three and a half sessions a week at 60 load for half a year: fitness has long met the load.
  const flat = steady(180, 2, () => 60)

  it('names the level the recent load settles at, and that it will not rise', () => {
    const { ceiling, progress } = ceilingOf(flat)
    expect(ceiling).not.toBeNull()
    expect(ceiling!.kind).toBe('flat')
    // Thirty a day on average: one session of sixty every other day.
    expect(ceiling!.level).toBeCloseTo(30, 0)
    expect(ceiling!.ahead).toBeLessThan(PLATEAU_GAIN)
    const today = progress.fitness[progress.fitness.length - 1]!.ctl
    expect(Math.abs(ceiling!.level - today)).toBeLessThan(3)
  })

  it('asks for easy time that lifts the level by at least a tenth', () => {
    const { ceiling } = ceilingOf(flat)
    expect(ceiling!.raised).toBeGreaterThanOrEqual(ceiling!.level * 1.1 - 0.1)
    // Counted at the rate of easy training, in quarter hours.
    const needed = ((ceiling!.raised - ceiling!.level) * 7 * 60) / EASY_LOAD_PER_HOUR
    expect(ceiling!.moreMinutes).toBeGreaterThanOrEqual(needed - 1)
    expect(ceiling!.moreMinutes % 15).toBe(0)
    expect(ceiling!.moreMinutes).toBeGreaterThanOrEqual(30)
  })

  it('says whether the time budget leaves room for it', () => {
    const { ceiling } = ceilingOf(flat)
    expect(ceiling!.budgetHours).toBe(6)
    expect(ceiling!.hoursPerWeek).toBeCloseTo(2.9, 0)
    expect(ceiling!.budgetFull).toBe(false)

    const tight: AthleteProfile = { ...profile, weeklySessions: { min: 3, max: 3 }, sessionMinutes: { min: 30, normal: 50, max: 60 } }
    expect(ceilingOf(flat, { ...context, profile: tight }).ceiling!.budgetFull).toBe(true)
  })

  it('stays quiet while the curve still has room to rise', () => {
    // The load doubled six weeks ago: fitness is still well below it.
    const rising = steady(180, 2, (daysAgo) => (daysAgo <= CTL_DAYS ? 90 : 40))
    expect(ceilingOf(rising).ceiling).toBeNull()
  })

  it('warns of the shape the screenshot showed: three months up from nothing, then the slope runs out', () => {
    // Three sessions a week at about seventy, starting from no training at all.
    const comeback = steady(91, 2, () => 58)
    const { ceiling, progress } = ceilingOf(comeback)
    const today = progress.fitness[progress.fitness.length - 1]!.ctl
    expect(today).toBeGreaterThan(20)
    expect(ceiling?.kind).toBe('flat')
  })

  it('says it is falling where the recent load lies below today', () => {
    const fading = steady(180, 2, (daysAgo) => (daysAgo <= 28 ? 25 : 70))
    const { ceiling } = ceilingOf(fading)
    expect(ceiling!.kind).toBe('falling')
    expect(ceiling!.ahead).toBeLessThan(0)
    // The time asked for lifts it above today's fitness, not merely back towards it.
    const { progress } = ceilingOf(fading)
    expect(ceiling!.raised).toBeGreaterThan(progress.fitness[progress.fitness.length - 1]!.ctl)
  })

  it('is left out where a break, a recovery week or a taper explains the curve', () => {
    const ill = [{ id: 'ill', kind: 'illness' as const, from: addDays(TODAY, -12), until: addDays(TODAY, -8) }]
    expect(ceilingOf(flat, { ...context, breaks: ill }).ceiling).toBeNull()
    expect(ceilingOf(flat, { ...context, phase: 'RECOVERY' }).ceiling).toBeNull()
    expect(ceilingOf(flat, { ...context, phase: 'TAPER' }).ceiling).toBeNull()
    // A break long over does not.
    const old = [{ id: 'old', kind: 'illness' as const, from: addDays(TODAY, -60), until: addDays(TODAY, -50) }]
    expect(ceilingOf(flat, { ...context, breaks: old }).ceiling).not.toBeNull()
  })

  it('needs about one session a week to read a level from', () => {
    const sparse = steady(180, 10, () => 60)
    expect(ceilingOf(sparse).ceiling).toBeNull()
  })

  it('is not read without the profile', () => {
    expect(buildProgress(flat, [], TODAY, 90).ceiling).toBeNull()
  })

  it('reads the same four weeks whatever span the page shows', () => {
    const short = buildProgress(flat, [], TODAY, 30, 4, { feasibility: [], sports: [], ceiling: context })
    expect(short.ceiling).toEqual(ceilingOf(flat).ceiling)
  })

  it('takes the current fitness as given', () => {
    // Far below the level: room to rise, so nothing to say.
    expect(fitnessCeiling(flat, TODAY, 10, context)).toBeNull()
  })
})
