import { describe, expect, it } from 'vitest'
import { planFromMorning } from '../src/coach/today.ts'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import { activity, baselineWellness, config, plannedEvent, TODAY, wellness } from './fixtures.ts'

const wellnessEntries = [wellness(0), ...baselineWellness()]
const rested = [activity(9, 'Ride', { load: 60, intensity: 70 }), activity(11, 'Run', { load: 50, intensity: 70 })]
const hardYesterday = [activity(1, 'Ride', { load: 95, intensity: 98 }), ...rested]

const morning = (activities: typeof rested) =>
  planDays(buildState(activities, wellnessEntries, TODAY), config, 3)

const idsOf = (day: ReturnType<typeof morning>[number] | undefined) =>
  day?.options.map((option) => option.template.id)

describe('a day that has already been trained', () => {
  const done = activity(0, 'Ride', { load: 95, intensity: 98, name: 'Zwift — Schwelle', movingTimeSec: 3900 })

  it('keeps the recommendation the athlete saw in the morning', () => {
    const before = morning(rested)
    const [today] = planFromMorning([...rested, done], wellnessEntries, [], config, TODAY, 3)
    expect(today?.dayType).toBe(before[0]?.dayType)
    expect(today?.recommended).toBe(before[0]?.recommended)
    expect(idsOf(today)).toEqual(idsOf(before[0]))
  })

  it('shows what was done', () => {
    const [today, tomorrow] = planFromMorning([...rested, done], wellnessEntries, [], config, TODAY, 3)
    expect(today?.completed).toEqual([
      expect.objectContaining({ name: 'Zwift — Schwelle', sport: 'Ride', load: 95, minutes: 65, templateId: null }),
    ])
    expect(tomorrow?.completed).toEqual([])
  })

  it('links it to the proposed session it fulfilled', () => {
    const event = plannedEvent(0, 'bike-sst-3x12', { externalId: `coach:${TODAY}:bike-sst-3x12` })
    const paired = { ...done, pairedEventId: event.id, compliance: 91 }
    const completions = completionsFrom([event], [paired])
    const [today] = planFromMorning([...rested, paired], wellnessEntries, completions, config, TODAY, 3)
    expect(today?.completed[0]).toMatchObject({ templateId: 'bike-sst-3x12', compliance: 91 })
  })

  it('ignores entries that carry no load', () => {
    const walk = activity(0, 'Run', { load: 0, name: 'Spaziergang' })
    const [today] = planFromMorning([...rested, walk], wellnessEntries, [], config, TODAY, 3)
    expect(today?.completed).toEqual([])
  })

  it('plans tomorrow from what was actually done, not from what was proposed', () => {
    const before = morning(hardYesterday)
    expect(before[0]?.dayType).not.toBe('KEY')
    expect(before[1]?.dayType).toBe('KEY')

    const hardAnyway = activity(0, 'Run', { load: 95, intensity: 98 })
    const [today, tomorrow] = planFromMorning(
      [...hardYesterday, hardAnyway],
      wellnessEntries,
      [],
      config,
      TODAY,
      3,
    )
    expect(idsOf(today)).toEqual(idsOf(before[0]))
    expect(tomorrow?.dayType).not.toBe('KEY')
  })

  it('plans exactly as before while nothing has been done today', () => {
    expect(planFromMorning(rested, wellnessEntries, [], config, TODAY, 3)).toEqual(morning(rested))
  })
})
