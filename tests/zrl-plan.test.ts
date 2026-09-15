import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays } from '../src/coach/dates.ts'
import { intensityClass } from '../src/coach/library.ts'
import { completedFrom } from '../src/coach/done.ts'
import { buildHistory } from '../src/coach/adherence.ts'
import { ZRL_TEMPLATE_ID } from '../src/coach/zrl.ts'
import type { Activity, CoachConfig, ZrlRace } from '../src/coach/types.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const stateFrom = (activities: readonly Activity[]) =>
  buildState(activities, [wellness(0), ...baselineWellness()], TODAY)

const rested = [
  activity(9, 'Ride', { load: 60, intensity: 70 }),
  activity(11, 'Run', { load: 50, intensity: 70 }),
]

const raceIn = (days: number, overrides: Partial<ZrlRace> = {}): ZrlRace => ({
  date: addDays(TODAY, days),
  format: 'scratch',
  route: {
    id: 3078665969,
    name: 'Rising Empire',
    world: 'new-york',
    distanceKm: 20.816,
    elevationM: 377,
    leadInKm: 0.38,
    leadInElevationM: 2,
  },
  laps: 2,
  ...overrides,
})

const withRaces = (races: readonly ZrlRace[], extra: Partial<CoachConfig> = {}): CoachConfig => ({
  ...config,
  zrlRaces: races,
  ...extra,
})

const ids = (day: ReturnType<typeof planDays>[number] | undefined) =>
  day?.options.map((option) => option.template.id) ?? []

describe('a league race day', () => {
  it('is a quality day with the race first and a hard alternative for each sport', () => {
    const [today] = planDays(stateFrom(rested), withRaces([raceIn(0)]), 1)
    expect(today?.dayType).toBe('KEY')
    expect(today?.recommended).toBe('Ride')
    expect(today?.options[0]?.template.id).toBe(ZRL_TEMPLATE_ID)
    expect(today?.options[0]?.race?.race.route?.name).toBe('Rising Empire')
    const alternatives = today?.options.slice(1) ?? []
    expect(alternatives.map((option) => option.sport).sort()).toEqual(['Ride', 'Run'])
    expect(
      alternatives.every((option) => intensityClass(option.template.stimulus) === 'hard'),
    ).toBe(true)
  })

  it('stays a quality day when the weekly count is already full', () => {
    const busyWeek = [
      activity(1, 'Run', { load: 40, intensity: 65 }),
      activity(2, 'Ride', { load: 40, intensity: 65 }),
      activity(2, 'Run', { load: 40, intensity: 65 }),
      ...rested,
    ]
    expect(planDays(stateFrom(busyWeek), withRaces([]), 1)[0]?.dayType).toBe('REST')
    expect(planDays(stateFrom(busyWeek), withRaces([raceIn(0)]), 1)[0]?.dayType).toBe('KEY')
  })

  it('never measures a threshold on race day or the day before', () => {
    const days = planDays(stateFrom(rested), withRaces([raceIn(1)]), 2)
    for (const day of days) {
      expect(
        day.options.some((option) => option.template.measures === 'threshold'),
        day.date,
      ).toBe(false)
    }
  })

  it('adds no strength session to the race', () => {
    expect(planDays(stateFrom(rested), withRaces([raceIn(0)]), 1)[0]?.strength).toBeNull()
  })

  it('counts the race when planning the days after', () => {
    const [, tomorrow] = planDays(stateFrom(rested), withRaces([raceIn(0)]), 2)
    expect(tomorrow?.dayType).not.toBe('KEY')
  })

  it('lets a wish for an easy day win, and still shows the race', () => {
    const [today] = planDays(stateFrom(rested), withRaces([raceIn(0)]), 1, [], 'easy')
    expect(today?.dayType).toBe('EASY')
    expect(ids(today)).toContain(ZRL_TEMPLATE_ID)
  })
})

describe('the day before a race', () => {
  it('is easy with openers on the bike, even when running has rested longer', () => {
    const rodeHard = [activity(3, 'Ride', { load: 95, intensity: 98 }), ...rested]
    const [today] = planDays(stateFrom(rodeHard), withRaces([raceIn(1)]), 1)
    expect(today?.dayType).toBe('EASY')
    expect(today?.recommended).toBe('Ride')
    expect(today?.options.find((option) => option.sport === 'Ride')?.template.id).toBe(
      'bike-zrl-openers',
    )
    expect(today?.notes.join(' ')).toContain('ZRL')
  })

  it('keeps a declared break that is still running today, race or not', () => {
    const ill = { id: 'ill', kind: 'illness' as const, from: addDays(TODAY, -2), until: TODAY }
    const [today] = planDays(stateFrom(rested), withRaces([raceIn(1)], { breaks: [ill] }), 1)
    expect(ids(today)).not.toContain('bike-zrl-openers')
    expect(today?.notes.join(' ')).toContain('Krankheit')
  })

  it('never offers the openers on an ordinary day', () => {
    const days = planDays(stateFrom(rested), withRaces([]), 7)
    expect(days.flatMap(ids)).not.toContain('bike-zrl-openers')
  })
})

describe('when racing is not the plan', () => {
  it('offers the race only voluntarily in a recovery week, after an easy alternative', () => {
    // Four weeks after this plan start, the week containing TODAY is the recovery week.
    const [today] = planDays(
      stateFrom(rested),
      withRaces([raceIn(0)], { planStart: '2026-08-10' }),
      1,
    )
    expect(today?.dayType).toBe('EASY')
    expect(ids(today).at(-1)).toBe(ZRL_TEMPLATE_ID)
    expect(
      today?.options.find((option) => option.sport === today.recommended)?.template.id,
    ).not.toBe(ZRL_TEMPLATE_ID)
    expect(today?.notes.join(' ')).toContain('Erholungswoche')
  })

  it('offers no race during a declared break', () => {
    const ill = {
      id: 'ill',
      kind: 'illness' as const,
      from: addDays(TODAY, -1),
      until: addDays(TODAY, 5),
    }
    const [today] = planDays(stateFrom(rested), withRaces([raceIn(0)], { breaks: [ill] }), 1)
    expect(ids(today)).not.toContain(ZRL_TEMPLATE_ID)
  })
})

describe('after the race', () => {
  const ridden = activity(0, 'Ride', {
    name: 'Zwift - Race: Zwift Racing League: City Showdown - Open Emerald League Division 2 (B) on Rising Empire in New York',
    load: 101,
  })

  it('marks the race card as done', () => {
    expect(completedFrom([ridden], [])[0]?.templateId).toBe(ZRL_TEMPLATE_ID)
  })

  it('names a recommended race that did not happen in the history', () => {
    const proposal = {
      date: addDays(TODAY, -2),
      recommended: ZRL_TEMPLATE_ID,
      templateIds: [ZRL_TEMPLATE_ID],
    }
    const day = buildHistory([], [], TODAY, 7, [proposal], []).at(-3)
    expect(day?.status).toBe('missed')
    expect(day?.planned).toEqual(['Zwift Racing League'])
  })
})

describe('race history', () => {
  it('reads races older than the training history the plan otherwise uses', () => {
    const lastSeason = activity(300, 'Ride', {
      name: 'Zwift - TTT: Zwift Racing League: Coast Clash - Open Olive Division 3 (B) on Southern Coast Cruise in Watopia',
      load: 60,
    })
    const state = buildState(rested, [wellness(0)], TODAY, [lastSeason, ...rested])
    expect(state.raceHistory).toHaveLength(1)
    expect(state.activityCount).toBe(rested.length)
  })
})
