import { describe, expect, it } from 'vitest'
import { completionsFrom, levelCeilings, levelFor, scheduledFrom } from '../src/coach/progression.ts'
import type { Completion } from '../src/coach/progression.ts'
import { LIBRARY } from '../src/coach/library.ts'
import { activity, plannedEvent } from './fixtures.ts'

const done = (templateId: string, compliance: number, daysAgo = 5) => {
  const event = plannedEvent(daysAgo, 'egal', { externalId: `coach:2026-01-01:${templateId}` })
  const act = activity(daysAgo, 'Ride', { load: 80, pairedEventId: event.id, compliance })
  return { events: [event], activities: [act] }
}

describe('progression families', () => {
  it('keeps level one available wherever a higher level is', () => {
    const families = [...new Set(LIBRARY.map((t) => t.family).filter(Boolean))] as string[]
    for (const family of families) {
      const members = LIBRARY.filter((t) => t.family === family)
      const first = members.find((t) => (t.level ?? 1) === 1)
      const higher = members.filter((t) => (t.level ?? 1) > 1).flatMap((t) => t.phases)
      expect(first, `${family} has no level 1`).toBeDefined()
      for (const phase of new Set(higher)) {
        expect(first?.phases, `${family} level 1 misses ${phase}`).toContain(phase)
      }
    }
  })

  it('numbers levels without gaps', () => {
    const families = [...new Set(LIBRARY.map((t) => t.family).filter(Boolean))] as string[]
    for (const family of families) {
      const levels = LIBRARY.filter((t) => t.family === family).map((t) => t.level ?? 1).sort()
      expect(levels).toEqual(levels.map((_unused, index) => index + 1))
    }
  })
})

describe('earning the next level', () => {
  it('starts everyone at level one', () => {
    expect(levelFor('bike-threshold', [])).toBe(1)
  })

  it('unlocks the next level after a session done closely enough', () => {
    const { events, activities } = done('bike-thr-short-3x8', 85)
    expect(levelFor('bike-threshold', completionsFrom(events, activities))).toBe(2)
  })

  it('holds the level when the session was executed poorly', () => {
    const { events, activities } = done('bike-thr-short-3x8', 55)
    expect(levelFor('bike-threshold', completionsFrom(events, activities))).toBe(1)
  })

  it('never goes past the hardest level that exists', () => {
    const { events, activities } = done('bike-thr-2x20', 95)
    expect(levelFor('bike-threshold', completionsFrom(events, activities))).toBe(3)
  })

  it('keeps families apart', () => {
    const { events, activities } = done('bike-thr-short-3x8', 90)
    const completions = completionsFrom(events, activities)
    expect(levelFor('run-threshold', completions)).toBe(1)
    expect(levelCeilings(completions)['bike-threshold']).toBe(2)
  })

  it('counts a session recognised from the data, without any calendar entry', () => {
    const recognised: Completion = {
      templateId: 'bike-thr-short-3x8',
      date: '2026-08-20',
      compliance: null,
      activityId: 'a',
      variant: 'full',
      evidence: 'exact',
    }
    expect(levelFor('bike-threshold', [recognised])).toBe(2)
    expect(levelFor('bike-threshold', [{ ...recognised, evidence: 'similar' }])).toBe(1)
  })

  it('reads the pushed duration to tell a short version from the full one', () => {
    const pushed = (minutes: number) => {
      const event = plannedEvent(3, 'egal', { externalId: `coach:2026-08-30:bike-thr-short-3x8:${minutes}` })
      const act = activity(3, 'Ride', { load: 80, pairedEventId: event.id, compliance: 90 })
      return completionsFrom([event], [act])[0]?.variant
    }
    expect(pushed(30)).toBe('short')
    expect(pushed(49)).toBe('full')
  })

  it('ignores a planned session that was never paired', () => {
    const event = plannedEvent(3, 'egal', { externalId: 'coach:2026-01-01:bike-thr-short-3x8' })
    expect(completionsFrom([event], [])).toEqual([])
  })

  it('ignores events this app did not create', () => {
    const event = plannedEvent(3, 'Eigene Einheit', { externalId: null })
    const act = activity(3, 'Ride', { load: 80, pairedEventId: event.id, compliance: 90 })
    expect(completionsFrom([event], [act])).toEqual([])
  })
})

describe('what is already on the calendar', () => {
  it('knows each pushed version by its duration', () => {
    const events = [
      plannedEvent(0, 'a', { externalId: 'coach:2026-09-02:bike-thr-short-3x8:30' }),
      plannedEvent(0, 'b', { externalId: 'coach:2026-09-02:bike-thr-short-3x8' }),
      plannedEvent(0, 'c', { externalId: 'coach:2026-09-02:run-long-80:short' }),
      plannedEvent(0, 'd', { externalId: null }),
    ]
    expect(scheduledFrom(events)).toEqual([
      { date: '2026-09-02', templateId: 'bike-thr-short-3x8', minutes: 30 },
      { date: '2026-09-02', templateId: 'bike-thr-short-3x8', minutes: 49 },
    ])
  })
})
