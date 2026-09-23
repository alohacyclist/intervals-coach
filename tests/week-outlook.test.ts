import { describe, expect, it } from 'vitest'
import { weekOutlook } from '../src/coach/week.ts'
import { seasonBand } from '../src/coach/phase.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays, startOfWeek } from '../src/coach/dates.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const stateFrom = (activities: Parameters<typeof buildState>[0], today = TODAY) =>
  buildState(activities, [wellness(0), ...baselineWellness()], today)

const hardRide = (daysAgo: number) =>
  activity(daysAgo, 'Ride', {
    load: 85,
    intensity: 95,
    movingTimeSec: 4500,
    zoneSeconds: { Z1: 900, Z4: 1800, Z5: 600 },
  })

describe('the week as a shape', () => {
  it('counts what the week already holds against what it has room for', () => {
    const week = weekOutlook(stateFrom([hardRide(0)]), config)

    expect(week.weekStart).toBe(startOfWeek(TODAY))
    expect(week.quality.done).toBe(1)
    expect(week.quality.budget).toBeGreaterThanOrEqual(1)
    expect(week.sessions.done).toBe(1)
    expect(week.daysLeft).toBeGreaterThan(0)
    expect(week.daysLeft).toBeLessThanOrEqual(7)
  })

  /**
   * The whole point of the view: which day the session landed on must not change
   * what it says. Only whether it happened at all.
   */
  it('reads the same whichever day of the week the session landed on', () => {
    const monday = startOfWeek(TODAY)
    const elapsed = Array.from({ length: 7 }, (_unused, index) => addDays(monday, index)).filter(
      (date) => date <= TODAY,
    )

    const shapes = elapsed.map((date) => {
      const daysAgo = elapsed.length - 1 - elapsed.indexOf(date)
      const { weekStart, sessions, quality } = weekOutlook(stateFrom([hardRide(daysAgo)]), config)
      return JSON.stringify({ weekStart, sessions, quality })
    })

    expect(new Set(shapes).size).toBe(1)
  })

  it('names a stimulus the athlete can train and has not trained in a fortnight', () => {
    const week = weekOutlook(stateFrom([hardRide(20)]), config)

    expect(week.openStimuli.length).toBeGreaterThan(0)
    expect(week.openStimuli.every((entry) => entry.daysAgo >= 14)).toBe(true)
    // Nothing swimming-shaped for an athlete who does not swim.
    expect(week.openStimuli.every((entry) => entry.sport !== 'Swim')).toBe(true)
  })

  it('says nothing is open once the stimuli are fresh', () => {
    const fresh = [hardRide(1), activity(2, 'Run', { load: 70, intensity: 92, zoneSeconds: { Z4: 900 } })]
    expect(weekOutlook(stateFrom(fresh), config).openStimuli.length).toBeLessThanOrEqual(3)
  })

  it('knows whether the long session of this week has happened', () => {
    // Ninety minutes is where fromZones starts calling a session long, and today
    // is inside this week whatever weekday the fixture falls on.
    const long = activity(0, 'Run', {
      load: 78,
      intensity: 78,
      movingTimeSec: 5400,
      zoneSeconds: { Z2: 5400 },
    })

    expect(weekOutlook(stateFrom([long]), config).longDone).toBe(true)
    expect(weekOutlook(stateFrom([hardRide(1)]), config).longDone).toBe(false)
  })
})

describe('the season band', () => {
  it('runs from this week to the goal week', () => {
    const band = seasonBand(config, TODAY)
    expect(band[0]?.start).toBe(startOfWeek(TODAY))
    expect(band[0]?.current).toBe(true)
    expect(band.every((week) => week.start === startOfWeek(week.start))).toBe(true)
  })

  it('does not move when training does — it only knows the calendar', () => {
    // Same config, same day, two athletes who trained nothing alike.
    expect(JSON.stringify(seasonBand(config, TODAY))).toBe(JSON.stringify(seasonBand(config, TODAY)))
  })

  it('marks every fourth week as recovery and never two in a row', () => {
    const band = seasonBand({ ...config, planStart: '2026-06-04' }, TODAY, 16)
    const recovery = band.filter((week) => week.recovery)
    expect(recovery.length).toBeGreaterThan(0)
    for (let index = 1; index < band.length; index += 1) {
      expect(band[index - 1]?.recovery && band[index]?.recovery).toBeFalsy()
    }
  })

  it('shows the phases moving towards the goal, not one flat block', () => {
    const band = seasonBand(config, TODAY, 16)
    expect(new Set(band.map((week) => week.phase)).size).toBeGreaterThan(1)
  })

  /**
   * phaseForSport lets the taper outrank the recovery week; the band has to agree,
   * or the goal week reads as a reduced week — which it is not.
   */
  it('never marks the taper week as a recovery week', () => {
    for (let offset = 7; offset <= 16 * 7; offset += 7) {
      const racing = {
        ...config,
        goals: config.goals.map((goal) => ({ ...goal, targetDate: addDays(TODAY, offset) })),
      }
      const taper = seasonBand(racing, TODAY, 16).filter((week) => week.phase === 'TAPER')
      expect(taper.every((week) => !week.recovery)).toBe(true)
    }
  })

  it('stops at sixteen weeks when the goal is open ended', () => {
    const openEnded = { ...config, goals: config.goals.map((goal) => ({ ...goal, targetDate: undefined })) }
    expect(seasonBand(openEnded, TODAY).length).toBe(16)
  })
})
