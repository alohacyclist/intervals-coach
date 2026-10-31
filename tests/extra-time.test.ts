import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import { findTemplate, flattenBlocks, intensityClass } from '../src/coach/library.ts'
import { lengthen } from '../src/coach/variant.ts'
import { buildSession } from '../src/coach/session.ts'
import type { Activity, PlannedSession, WorkoutTemplate } from '../src/coach/types.ts'
import {
  BIKE_THRESHOLD,
  RUN_THRESHOLD,
  SWIM_THRESHOLD,
  activity,
  baselineWellness,
  config,
  plannedEvent,
  TODAY,
  wellness,
} from './fixtures.ts'

const template = (id: string): WorkoutTemplate => {
  const found = findTemplate(id)
  if (!found) throw new Error(`missing template ${id}`)
  return found
}

const easyZones = { Z1: 1800, Z2: 5100 }

const stateFrom = (activities: readonly Activity[], wellnessEntries = [wellness(0), ...baselineWellness()]) =>
  buildState(activities, wellnessEntries, TODAY)

/** Rested, and with a two hour ride and a ninety minute run three weeks ago as the yardstick. */
const withLongOnes = [
  activity(9, 'Ride', { load: 60, intensity: 70 }),
  activity(11, 'Run', { load: 50, intensity: 70 }),
  activity(20, 'Ride', { load: 92, intensity: 68, movingTimeSec: 120 * 60, zoneSeconds: easyZones }),
  activity(22, 'Run', { load: 90, intensity: 75, movingTimeSec: 90 * 60, zoneSeconds: easyZones }),
]

/** Recent threshold tests, so the day offers ordinary quality work rather than a test. */
const measured = ['test-bike-ftp20', 'test-run-thr20'].flatMap((templateId) => {
  const event = plannedEvent(20, templateId, { externalId: `coach:2026-08-01:${templateId}` })
  const act = activity(20, 'Ride', { load: 80, pairedEventId: event.id, compliance: 95 })
  return completionsFrom([event], [act])
})

const stretched = (session: PlannedSession | undefined) =>
  session?.variants.find((variant) => variant.tier === 'extra')

describe('lengthening a session', () => {
  it('adds base after the 40/20 and leaves every interval as it was', () => {
    const stretch = lengthen(template('bike-vo2-3040'), BIKE_THRESHOLD, 65)
    expect(stretch?.minutes).toBe(120)
    expect(stretch?.name).toBe('VO2max 3x6x40/20 + 65min Grundlage')
    const original = template('bike-vo2-3040').blocks
    // The base comes before the cool-down, which stays the last thing ridden.
    expect(stretch?.blocks.slice(0, original.length - 1)).toEqual(original.slice(0, -1))
    expect(stretch?.blocks.at(-2)).toMatchObject({ duration: '65m', label: 'Grundlage' })
    expect(stretch?.blocks.at(-1)).toEqual(original.at(-1))
  })

  it('puts base in front of the work when the athlete wants it later, and the rest after', () => {
    const stretch = lengthen(template('bike-vo2-3040'), BIKE_THRESHOLD, 65, 30)
    const original = template('bike-vo2-3040').blocks
    expect(stretch?.minutes).toBe(120)
    expect(stretch?.blocks[0]).toEqual(original[0])
    // The warm-up is 15 minutes: another 15 of base, and the work begins at 30.
    expect(stretch?.blocks[1]).toMatchObject({ duration: '15m', label: 'Grundlage' })
    expect(stretch?.blocks[2]).toEqual(original[1])
    expect(stretch?.blocks.at(-2)).toMatchObject({ duration: '50m', label: 'Grundlage' })
    expect(stretch?.blocks.at(-1)).toEqual(original.at(-1))
    expect(stretch?.core).toEqual({ from: 30, latest: 80 })
    expect(stretch?.added).toEqual([
      '15 min lockere Grundlage vor dem Hauptteil, Intervalle ab Minute 30',
      '50 min lockere Grundlage nach dem Hauptteil',
    ])
  })

  it('puts no more base in front than was added', () => {
    const stretch = lengthen(template('bike-vo2-3040'), BIKE_THRESHOLD, 30, 90)
    expect(stretch?.core?.from).toBe(45)
    expect(stretch?.blocks.filter((block) => block.kind === 'step' && block.label === 'Grundlage')).toHaveLength(1)
    expect(stretch?.blocks.at(-1)).toEqual(template('bike-vo2-3040').blocks.at(-1))
  })

  it('counts the base at what an easy hour costs', () => {
    const stretch = lengthen(template('bike-vo2-3040'), BIKE_THRESHOLD, 60)
    expect(stretch?.load).toBe(template('bike-vo2-3040').load + 46)
  })

  it('lets a base ride simply go on, and names it by its new length', () => {
    const stretch = lengthen(template('bike-endurance-75'), BIKE_THRESHOLD, 45)
    expect(stretch?.name).toBe('Grundlage 120min')
    expect(flattenBlocks(stretch?.blocks ?? []).map((step) => step.duration)).toEqual(['10m', '100m', '10m'])
  })

  it('keeps the closing block of a long ride at the end', () => {
    const stretch = lengthen(template('bike-long-150'), BIKE_THRESHOLD, 30)
    const steps = flattenBlocks(stretch?.blocks ?? [])
    expect(steps.map((step) => step.duration)).toEqual(['10m', '150m', '10m', '10m'])
  })

  it('stretches neither a recovery spin, nor a test, nor a swim', () => {
    expect(lengthen(template('bike-recovery-40'), BIKE_THRESHOLD, 60)).toBeNull()
    expect(lengthen(template('test-bike-ftp20'), BIKE_THRESHOLD, 60)).toBeNull()
    expect(lengthen(template('swim-endurance-1500'), SWIM_THRESHOLD, 30)).toBeNull()
  })

  it('does not bother for a few minutes', () => {
    expect(lengthen(template('bike-vo2-3040'), BIKE_THRESHOLD, 8)).toBeNull()
  })

  it('runs further at the easy pace of a long run', () => {
    const stretch = lengthen(template('run-long-80'), RUN_THRESHOLD, 15)
    expect(flattenBlocks(stretch?.blocks ?? [])).toEqual([
      expect.objectContaining({ duration: '95m', target: '76-84% Pace' }),
    ])
  })
})

describe('the versions of a session on a day with more time', () => {
  it('offers a long session whole when it fills the time', () => {
    const session = buildSession(template('bike-long-150'), config, 'Lockerer Tag', TODAY, 150)
    expect(session.variants.at(-1)).toMatchObject({ tier: 'extra', minutes: 150, cuts: [] })
  })

  it('adds no extra version that would be no longer than the usual ones', () => {
    const session = buildSession(template('bike-recovery-40'), config, 'Lockerer Tag', TODAY, 120)
    expect(session.variants.map((variant) => variant.tier)).not.toContain('extra')
  })
})

describe('a day with more time', () => {
  it('keeps the quality session and adds base to it', () => {
    const [today] = planDays(stateFrom(withLongOnes), config, 1, measured, undefined, [], 120)
    expect(today?.dayType).toBe('KEY')
    const ride = today?.options.find((option) => option.sport === 'Ride')
    expect(intensityClass(ride?.template.stimulus ?? 'RECOVERY')).toBe('hard')
    expect(stretched(ride)).toMatchObject({ minutes: 120, added: [expect.stringContaining('Grundlage')] })
    expect(today?.notes.some((note) => note.startsWith('Mehr Zeit an einem Qualitätstag'))).toBe(true)
  })

  it('says on the day in a few words what the time is for and where it goes past the usual', () => {
    const shorter = withLongOnes.map((entry) => (entry.sport === 'Run' ? { ...entry, movingTimeSec: 45 * 60 } : entry))
    const [today] = planDays(stateFrom(shorter), config, 1, measured, undefined, [], 120)
    expect(today?.moreTime).toEqual([
      'Mehr Zeit: lockere Grundlage nach den Intervallen',
      'Laufen: mehr als empfohlen (55 min)',
    ])
    // The why waits in the background.
    expect(
      today?.notes.some((note) => note.startsWith('Laufen 120 min wie eingestellt — empfohlen wären bis 55 min: dein längster Lauf')),
    ).toBe(true)
  })

  it('still offers the full session next to the long one', () => {
    const [today] = planDays(stateFrom(withLongOnes), config, 1, measured, undefined, [], 120)
    const ride = today?.options.find((option) => option.sport === 'Ride')
    // The full session stays on offer below the longer one.
    expect(ride?.variants.some((variant) => variant.minutes === ride.template.minutes)).toBe(true)
  })

  it('runs a session as long as the time set, past what recent training suggests', () => {
    const shorter = withLongOnes.map((entry) =>
      entry.movingTimeSec === 120 * 60 ? { ...entry, movingTimeSec: 80 * 60 } : entry,
    )
    const [today] = planDays(stateFrom(shorter), config, 1, measured, undefined, [], 180)
    const ride = today?.options.find((option) => option.sport === 'Ride')
    expect(stretched(ride)?.minutes).toBe(180)
    // A quarter past the longest of the last six weeks is what is suggested, and said.
    expect(today?.notes.some((note) => note.startsWith('Rad 180 min wie eingestellt — empfohlen wären bis 100 min: mehr tragen deine Fitness'))).toBe(true)
  })

  it('says nothing about the length where fitness carries it', () => {
    // Six weeks of an hour a day, then two days off: plenty of fitness, rested, never a long ride.
    const daily = Array.from({ length: 40 }, (_unused, index) =>
      activity(index + 3, 'Ride', { id: `d-${index}`, load: 55, intensity: 70, zoneSeconds: easyZones }),
    )
    const state = stateFrom(daily)
    const fromFitness = Math.floor(((3 * Math.round(state.overall.ctl)) / 46) * 60 / 5) * 5
    expect(fromFitness).toBeGreaterThan(120)
    const [today] = planDays(state, config, 1, measured, 'easy', [], 120)
    expect(stretched(today?.options.find((option) => option.sport === 'Ride'))?.minutes).toBe(120)
    expect(today?.moreTime.some((note) => note.startsWith('Rad'))).toBe(false)
  })

  it('measures a ride against what was ridden this season', () => {
    const season = [...withLongOnes.filter((entry) => entry.movingTimeSec <= 3600), activity(70, 'Ride', { id: 'season', load: 110, movingTimeSec: 150 * 60, zoneSeconds: easyZones })]
    const [today] = planDays(stateFrom(season), config, 1, measured, 'easy', [], 180)
    expect(stretched(today?.options.find((option) => option.sport === 'Ride'))?.minutes).toBe(180)
    expect(today?.moreTime).toContain('Rad: mehr als empfohlen (150 min)')
  })

  it('suggests a run grow by a tenth, and at least ten minutes', () => {
    const [today] = planDays(stateFrom(withLongOnes), config, 1, measured, 'easy', [], 180)
    expect(stretched(today?.options.find((option) => option.sport === 'Run'))?.minutes).toBe(180)
    const short = withLongOnes.map((entry) => (entry.sport === 'Run' ? { ...entry, movingTimeSec: 45 * 60 } : entry))
    const [shortDay] = planDays(stateFrom(short), config, 1, measured, 'easy', [], 180)
    expect(today?.moreTime).toContain('Laufen: mehr als empfohlen (100 min)')
    expect(shortDay?.moreTime).toContain('Laufen: mehr als empfohlen (55 min)')
  })

  it('says so when the day is a test, which stays as it is', () => {
    const [today] = planDays(stateFrom(withLongOnes), config, 1, [], undefined, [], 120)
    expect(today?.options.every((option) => stretched(option) === undefined)).toBe(true)
    expect(today?.notes.some((note) => note.includes('ein Test bleibt, wie er ist'))).toBe(true)
  })

  it('warns where there is nothing recent to measure against, and still runs the time set', () => {
    const rideOnly = withLongOnes.filter((entry) => entry.sport === 'Ride')
    const [today] = planDays(stateFrom(rideOnly), config, 1, measured, undefined, [], 120)
    expect(stretched(today?.options.find((option) => option.sport === 'Run'))?.minutes).toBe(120)
    expect(today?.moreTime).toContain('Laufen: lange nicht gemacht')
    expect(today?.notes).toContain(
      'Laufen 120 min wie eingestellt — Vorsicht: in den letzten sechs Wochen kein Lauf, an dem sich mehr messen ließe.',
    )
  })

  it('moves the intervals to the minute set, with base in front of them and the rest after', () => {
    const [today] = planDays(stateFrom(withLongOnes), config, 1, measured, undefined, [], 120, 30)
    const ride = stretched(today?.options.find((option) => option.sport === 'Ride'))
    expect(ride?.minutes).toBe(120)
    expect(ride?.core?.from).toBe(30)
    expect(today?.moreTime[0]).toBe('Mehr Zeit: Intervalle ab Minute 30')
  })

  it('keeps the intervals right after the warm-up without a minute set', () => {
    const [today] = planDays(stateFrom(withLongOnes), config, 1, measured, undefined, [], 120)
    const ride = stretched(today?.options.find((option) => option.sport === 'Ride'))
    expect(ride?.core?.from).toBeLessThan(30)
    expect(ride?.core?.latest).toBeGreaterThan(60)
  })

  it('leaves a day the body asked to keep easy as it is', () => {
    const tired = [wellness(0, { hrv: 50, restingHr: 52 }), ...baselineWellness()]
    const [today] = planDays(stateFrom(withLongOnes, tired), config, 1, measured, undefined, [], 120)
    expect(today?.options.every((option) => stretched(option) === undefined)).toBe(true)
    expect(today?.notes.some((note) => note.startsWith('Mehr Zeit ändert heute nichts'))).toBe(true)
  })

  it('applies to today only', () => {
    const days = planDays(stateFrom(withLongOnes), config, 3, measured, undefined, [], 120)
    for (const day of days.slice(1)) {
      expect(day.options.every((option) => stretched(option) === undefined)).toBe(true)
    }
  })

  it('carries the longer session into the days after', () => {
    const usual = planDays(stateFrom(withLongOnes), config, 2, measured)
    const longer = planDays(stateFrom(withLongOnes), config, 2, measured, undefined, [], 120)
    expect(longer[0]?.dayType).toBe(usual[0]?.dayType)
    // More load today shows up as a deeper form tomorrow.
    const formOf = (notes: readonly string[] | undefined) => notes?.find((note) => note.includes('(Form ')) ?? ''
    expect(formOf(longer[1]?.notes)).not.toBe(formOf(usual[1]?.notes))
  })

  it('changes nothing when the time is no more than usual', () => {
    const usual = planDays(stateFrom(withLongOnes), config, 1, measured)
    const same = planDays(stateFrom(withLongOnes), config, 1, measured, undefined, [], config.profile.sessionMinutes.max)
    expect(same).toEqual(usual)
  })
})
