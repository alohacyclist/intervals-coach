import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, startOfWeek } from '../src/coach/dates.ts'
import { DEFAULT_CONFIG, validateConfig } from '../src/coach/config-schema.ts'
import { isHardActivity } from '../src/coach/fitness.ts'
import { DEMO_ATHLETE_ID, demoConfig, generateDemo, intervalsOf, streamsOf } from '../server/demo/fixtures.ts'
import { demoData, fixtureSource } from '../server/demo/source.ts'
import { SourceReadOnlyError } from '../server/source.ts'
import { IntervalsError } from '../server/intervals.ts'

// A Wednesday; the demo is laid out relative to whatever day it is given.
const TODAY = '2026-10-21'

afterEach(() => {
  vi.unstubAllGlobals()
})

const weekLoad = (data: ReturnType<typeof generateDemo>, week: number): number => {
  const start = addDays(startOfWeek(TODAY), week * 7)
  return data.activities
    .filter((activity) => activity.date >= start && activity.date <= addDays(start, 6))
    .reduce((sum, activity) => sum + activity.load, 0)
}

describe('demo fixtures', () => {
  it('are the same every time for the same day', () => {
    const first = generateDemo(TODAY)
    const second = generateDemo(TODAY)
    expect(JSON.stringify(second.activities)).toBe(JSON.stringify(first.activities))
    expect(JSON.stringify(second.wellness)).toBe(JSON.stringify(first.wellness))
    expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events))
  })

  it('move with today: a week later, everything is a week later', () => {
    const now = generateDemo(TODAY)
    const later = generateDemo(addDays(TODAY, 7))
    const shift = (date: string) => addDays(date, 7)
    expect(later.activities.map((activity) => [activity.date, activity.name])).toEqual(
      now.activities.map((activity) => [shift(activity.date), activity.name]),
    )
    expect(later.config.planStart).toBe(shift(now.config.planStart))
  })

  it('hold nothing done today or later — the demo morning is still open', () => {
    const data = generateDemo(TODAY)
    expect(data.activities.every((activity) => activity.date < TODAY)).toBe(true)
    expect(data.events.every((event) => event.date < TODAY)).toBe(true)
    expect(data.wellness.at(-1)?.date).toBe(TODAY)
  })

  it('leave one key session undone within the last week, and only that one', () => {
    const data = generateDemo(TODAY)
    const missed = data.events.filter((event) => event.pairedActivityId === null && event.date >= addDays(TODAY, -7))
    expect(missed).toHaveLength(1)
    expect(data.activities.some((activity) => activity.date === missed[0]!.date)).toBe(false)
  })

  it('pair every calendar workout that was done with its activity, both ways', () => {
    const data = generateDemo(TODAY)
    for (const event of data.events.filter((entry) => entry.pairedActivityId !== null)) {
      const activity = data.activities.find((entry) => entry.id === event.pairedActivityId)
      expect(activity?.pairedEventId).toBe(event.id)
      expect(event.externalId).toMatch(/^coach:\d{4}-\d{2}-\d{2}:[a-z0-9-]+:\d+$/)
    }
  })

  it('look like training: loaded weeks, a lighter recovery week, hard sessions recognised from their zones', () => {
    const data = generateDemo(TODAY)
    const loaded = [-5, -4, -3, -1].map((week) => weekLoad(data, week))
    for (const load of loaded) expect(load).toBeGreaterThan(150)
    for (const load of loaded) expect(load).toBeLessThan(450)
    // The week before last is the recovery week.
    expect(weekLoad(data, -2)).toBeLessThan(Math.min(weekLoad(data, -3), weekLoad(data, -1)) * 0.8)
    const hardLastMonth = data.activities.filter((activity) => activity.date >= addDays(TODAY, -28) && isHardActivity(activity))
    // Two quality sessions in each of three loaded weeks, two of them missed.
    expect(hardLastMonth.length).toBeGreaterThanOrEqual(4)
  })

  it('show the cold as a break, in HRV and in resting pulse', () => {
    const data = generateDemo(TODAY)
    const [sick] = data.config.breaks
    expect(sick?.kind).toBe('illness')
    const during = data.wellness.filter((entry) => entry.date >= sick!.from && entry.date <= sick!.until)
    const normal = data.wellness.filter((entry) => entry.date >= addDays(TODAY, -14))
    const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean(during.map((entry) => entry.hrv!))).toBeLessThan(mean(normal.map((entry) => entry.hrv!)) - 8)
    expect(mean(during.map((entry) => entry.restingHr!))).toBeGreaterThan(mean(normal.map((entry) => entry.restingHr!)) + 3)
    expect(data.activities.some((activity) => activity.date >= sick!.from && activity.date <= sick!.until)).toBe(false)
  })

  it('describe each session the same way in its load, intervals and streams', () => {
    const data = generateDemo(TODAY)
    for (const session of [...data.sessions.values()].slice(-30)) {
      const intervals = intervalsOf(session)
      expect(intervals.reduce((sum, interval) => sum + interval.seconds, 0)).toBe(session.activity.movingTimeSec)
      const streams = streamsOf(session)
      if (session.template.sport === 'Swim') {
        expect(streams.time).toHaveLength(0)
      } else {
        expect(streams.time).toHaveLength(session.activity.movingTimeSec)
        expect(streams.heartRate).toHaveLength(session.activity.movingTimeSec)
      }
    }
  })

  it('carry an invented athlete with a valid configuration, unlike the operator defaults', () => {
    const config = demoConfig(TODAY)
    expect(validateConfig(config)).toEqual(config)
    expect(config.profile).not.toEqual(DEFAULT_CONFIG.profile)
    expect(config.goals.map((goal) => goal.id)).not.toEqual(DEFAULT_CONFIG.goals.map((goal) => goal.id))
    expect(generateDemo(TODAY).activities.every((activity) => activity.source === 'DEMO')).toBe(true)
  })
})

describe('fixture source', () => {
  it('answers the date ranges it is asked for', async () => {
    const source = fixtureSource(demoData(TODAY))
    const week = await source.activities(addDays(TODAY, -7), TODAY)
    expect(week.length).toBeGreaterThan(0)
    expect(week.every((activity) => activity.date >= addDays(TODAY, -7) && activity.date <= TODAY)).toBe(true)
    expect(await source.wellness(TODAY, TODAY)).toHaveLength(1)
  })

  it('never touches the network, whatever is read', async () => {
    const network = vi.fn(async () => new Response('nein', { status: 500 }))
    vi.stubGlobal('fetch', network)
    const data = demoData(TODAY)
    const source = fixtureSource(data)
    const [first] = data.sessions.values()
    await source.activities(addDays(TODAY, -400), TODAY)
    await source.wellness(addDays(TODAY, -60), TODAY)
    await source.events(addDays(TODAY, -120), TODAY)
    await source.sportSettings()
    await source.destinations()
    await source.activity(first!.activity.id)
    await source.intervals(first!.activity.id)
    await source.workIntervals(first!.activity.id)
    await source.streams(first!.activity.id, first!.template.sport)
    expect(network).not.toHaveBeenCalled()
  })

  it('refuses every write with a message for the athlete, and may not rewrite streams', async () => {
    const source = fixtureSource(demoData(TODAY))
    expect(source.canRewriteStreams).toBe(false)
    expect(source.athleteId).toBe(DEMO_ATHLETE_ID)
    await expect(source.createWorkout({ date: TODAY, sport: 'Ride', templateId: 'x', name: 'x', description: '', minutes: 60 })).rejects.toBeInstanceOf(SourceReadOnlyError)
    await expect(source.updateThreshold('Ride', 260)).rejects.toBeInstanceOf(SourceReadOnlyError)
    await expect(source.applyDestinations(['garmin'])).rejects.toBeInstanceOf(SourceReadOnlyError)
    await expect(source.replaceHeartRate('x', [])).rejects.toBeInstanceOf(SourceReadOnlyError)
    await expect(source.addActivityNote('x', 'y')).rejects.toBeInstanceOf(SourceReadOnlyError)
    expect(source.fresh()).toBe(source)
  })

  it('answers an unknown activity as intervals.icu would', async () => {
    const source = fixtureSource(demoData(TODAY))
    await expect(source.activity('gibt-es-nicht')).rejects.toBeInstanceOf(IntervalsError)
  })
})
