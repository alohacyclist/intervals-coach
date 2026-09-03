import { describe, expect, it } from 'vitest'
import { buildHistory, isOurs } from '../src/coach/adherence.ts'
import { activity, plannedEvent, TODAY } from './fixtures.ts'

const dayOn = (history: ReturnType<typeof buildHistory>, daysAgo: number) =>
  history[history.length - 1 - daysAgo]

describe('recognising our own proposals', () => {
  it('accepts an event tagged by this app', () => {
    expect(isOurs(plannedEvent(1, 'Irgendwas', { externalId: 'coach:2026-09-01:tpl' }))).toBe(true)
  })

  it('accepts an older push by its workout name', () => {
    expect(isOurs(plannedEvent(1, 'Schwelle 3x12min', { externalId: null }))).toBe(true)
  })

  it('ignores a workout the athlete planned themselves', () => {
    expect(isOurs(plannedEvent(1, 'Eigenes Bergintervall', { externalId: null }))).toBe(false)
  })
})

describe('adherence history', () => {
  it('covers the requested window, oldest first', () => {
    const history = buildHistory([], [], TODAY, 7)
    expect(history).toHaveLength(7)
    expect(history[6]?.date).toBe(TODAY)
    expect(history[0]?.date).toBe('2026-08-27')
  })

  it('marks a planned session that intervals.icu paired as done', () => {
    const event = plannedEvent(2, 'Schwelle 3x12min')
    const done = activity(2, 'Ride', { load: 88, pairedEventId: event.id, compliance: 85 })
    const day = dayOn(buildHistory([event], [done], TODAY), 2)
    expect(day?.status).toBe('done')
    expect(day?.compliance).toBe(85)
  })

  it('also accepts the pairing recorded on the event', () => {
    const done = activity(2, 'Ride', { load: 88 })
    const event = plannedEvent(2, 'Schwelle 3x12min', { pairedActivityId: done.id })
    expect(dayOn(buildHistory([event], [done], TODAY), 2)?.status).toBe('done')
  })

  it('calls it switched when something else was trained that day', () => {
    const event = plannedEvent(2, 'Schwelle 3x12min')
    const other = activity(2, 'Run', { load: 40, name: 'Lockerer Lauf' })
    const day = dayOn(buildHistory([event], [other], TODAY), 2)
    expect(day?.status).toBe('switched')
    expect(day?.completed).toBe('Lockerer Lauf')
  })

  it('calls it missed when nothing was trained', () => {
    const day = dayOn(buildHistory([plannedEvent(2, 'Schwelle 3x12min')], [], TODAY), 2)
    expect(day?.status).toBe('missed')
    expect(day?.planned).toEqual(['Schwelle 3x12min'])
  })

  it('calls training without a plan spontaneous', () => {
    const day = dayOn(buildHistory([], [activity(1, 'Run', { load: 37 })], TODAY), 1)
    expect(day?.status).toBe('unplanned')
    expect(day?.load).toBe(37)
  })

  it('leaves an empty day as rest', () => {
    expect(dayOn(buildHistory([], [], TODAY), 3)?.status).toBe('rest')
  })

  it('counts one paired option as success when both sports were pushed', () => {
    const ride = plannedEvent(2, 'Schwelle kompakt 3x8min')
    const run = plannedEvent(2, 'Schwelle 5x1km', { sport: 'Run' })
    const done = activity(2, 'Ride', { load: 51, pairedEventId: ride.id, compliance: 85 })
    const day = dayOn(buildHistory([ride, run], [done], TODAY), 2)
    expect(day?.status).toBe('done')
    expect(day?.planned).toHaveLength(2)
  })

  it('ignores zero load entries when judging a day', () => {
    const event = plannedEvent(2, 'Schwelle 3x12min')
    const day = dayOn(buildHistory([event], [activity(2, 'Ride', { load: 0 })], TODAY), 2)
    expect(day?.status).toBe('missed')
  })
})
