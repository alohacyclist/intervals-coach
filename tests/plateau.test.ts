import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays } from '../src/coach/dates.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import type { Activity, CoachConfig } from '../src/coach/types.ts'
import { activity, baselineWellness, config, plannedEvent, TODAY, wellness } from './fixtures.ts'

const stateFrom = (activities: readonly Activity[]) =>
  buildState(activities, [wellness(0), ...baselineWellness()], TODAY)

/** Recent tests, so the quality day trains instead of measuring. */
const measured = ['test-bike-ftp20', 'test-run-thr20'].flatMap((templateId) => {
  const event = plannedEvent(20, templateId, { externalId: `coach:2026-08-13:${templateId}` })
  return completionsFrom([event], [activity(20, 'Ride', { load: 80, pairedEventId: event.id, compliance: 95 })])
})

/** Every `every` days for half a year, the newest two days ago, easy so no day after is held back. */
const steady = (every: number, load: (daysAgo: number) => number): readonly Activity[] =>
  Array.from({ length: Math.floor(178 / every) }, (_unused, index) => 2 + index * every).map((daysAgo, index) =>
    activity(daysAgo, index % 2 === 0 ? 'Ride' : 'Run', { load: load(daysAgo), intensity: 65, movingTimeSec: 3600 }),
  )

const roomy: CoachConfig = {
  ...config,
  profile: { ...config.profile, sessionMinutes: { min: 45, normal: 60, max: 90 } },
}

const today = (activities: readonly Activity[], setup: CoachConfig = roomy) =>
  planDays(stateFrom(activities), setup, 3, measured)[0]!

const longest = (day: ReturnType<typeof today>) =>
  day.options.map((option) => ({
    template: option.template.minutes,
    extra: option.variants.find((variant) => variant.tier === 'extra')?.minutes ?? null,
  }))

describe('a flat fitness curve', () => {
  const flat = steady(2, () => 55)

  it('is read over four weeks', () => {
    expect(stateFrom(flat).ctlGain28).toBeLessThan(2)
  })

  it('lengthens the sessions by easy base when every promised session was done', () => {
    const day = today(flat)
    expect(day.notes.some((note) => note.includes('länger, nicht härter'))).toBe(true)
    const grown = longest(day).filter((entry) => entry.extra !== null)
    expect(grown.length).toBeGreaterThan(0)
    for (const entry of grown) {
      expect(entry.extra!).toBeGreaterThan(entry.template)
      expect(entry.extra!).toBeLessThanOrEqual(90)
    }
  })

  it('leaves a rising curve alone', () => {
    const rising = steady(2, (daysAgo) => (daysAgo < 40 ? 95 : 40))
    expect(stateFrom(rising).ctlGain28).toBeGreaterThanOrEqual(2)
    const day = today(rising)
    expect(day.notes.some((note) => note.includes('Fitness in vier Wochen'))).toBe(false)
    expect(longest(day).every((entry) => entry.extra === null)).toBe(true)
  })

  it('names missing sessions instead, and adds no time', () => {
    const fewer: CoachConfig = { ...roomy, profile: { ...roomy.profile, weeklySessions: { min: 4, max: 5 } } }
    const day = today(flat, fewer)
    // Where the plan already works with fewer, its own note says so; otherwise the plateau names it.
    expect(
      day.notes.some((note) => note.includes('es fehlen Einheiten') || note.includes('geplant wird mit')),
    ).toBe(true)
    expect(day.notes.some((note) => note.includes('länger, nicht härter'))).toBe(false)
    expect(longest(day).every((entry) => entry.extra === null)).toBe(true)
  })

  it('names missing sessions when the plan still counts on all of them', () => {
    // Four a week promised, three and a half done: close enough that the plan keeps four.
    const almost = [...steady(2, () => 55), activity(3, 'Run', { load: 55, intensity: 65 })]
    const fewer: CoachConfig = { ...roomy, profile: { ...roomy.profile, weeklySessions: { min: 4, max: 5 } } }
    const day = today(almost, fewer)
    expect(day.notes.some((note) => note.includes('es fehlen Einheiten'))).toBe(true)
  })

  it('is explained by a recent break', () => {
    const ill: CoachConfig = {
      ...roomy,
      breaks: [{ id: 'ill', kind: 'illness', from: addDays(TODAY, -20), until: addDays(TODAY, -14) }],
    }
    const day = today(flat, ill)
    expect(day.notes.some((note) => note.includes('Fitness in vier Wochen'))).toBe(false)
  })
})
