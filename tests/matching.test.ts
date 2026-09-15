import { describe, expect, it } from 'vitest'
import { matchedCompletions, mergeCompletions } from '../src/coach/matching.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import { addDays } from '../src/coach/dates.ts'
import type { Activity, DayProposal } from '../src/coach/types.ts'
import { activity, config, plannedEvent, TODAY } from './fixtures.ts'

const proposal = (daysAgo: number, templateIds: readonly string[]): DayProposal => ({
  date: addDays(TODAY, -daysAgo),
  recommended: templateIds[0] ?? null,
  templateIds,
})

const thresholdRide = (daysAgo: number, overrides: Partial<Activity> = {}) =>
  activity(daysAgo, 'Ride', {
    load: 70,
    movingTimeSec: 50 * 60,
    zoneSeconds: { Z1: 900, Z2: 600, Z4: 24 * 60 },
    ...overrides,
  })

const easy = { Z1: 600, Z2: 2400 }

describe('recognising a proposal without the calendar', () => {
  it('credits the proposed session from the ride alone', () => {
    const ride = thresholdRide(2)
    expect(
      matchedCompletions(
        [proposal(2, ['bike-thr-short-3x8', 'run-easy-strides'])],
        [ride],
        config.profile,
      ),
    ).toEqual([
      {
        templateId: 'bike-thr-short-3x8',
        date: ride.date,
        compliance: null,
        activityId: ride.id,
        variant: 'full',
        evidence: 'exact',
      },
    ])
  })

  it('files a clearly shorter session as the short version', () => {
    const [match] = matchedCompletions(
      [proposal(2, ['bike-thr-short-3x8'])],
      [thresholdRide(2, { movingTimeSec: 30 * 60 })],
      config.profile,
    )
    expect(match?.variant).toBe('short')
  })

  it('does not credit a hard proposal with an easy ride', () => {
    const ride = activity(2, 'Ride', { load: 45, zoneSeconds: easy })
    expect(
      matchedCompletions([proposal(2, ['bike-thr-short-3x8'])], [ride], config.profile),
    ).toEqual([])
  })

  it('credits an easy long run done shorter as similar, not as exact', () => {
    const run = activity(1, 'Run', { load: 57, movingTimeSec: 51 * 60, zoneSeconds: easy })
    const [match] = matchedCompletions([proposal(1, ['run-long-80'])], [run], config.profile)
    expect(match).toMatchObject({
      templateId: 'run-long-80',
      evidence: 'similar',
      variant: 'short',
    })
  })

  it('stays within the sport', () => {
    const run = activity(2, 'Run', { load: 70, zoneSeconds: { Z4: 24 * 60 } })
    expect(
      matchedCompletions([proposal(2, ['bike-thr-short-3x8'])], [run], config.profile),
    ).toEqual([])
  })

  it('needs a proposal on that very day', () => {
    expect(
      matchedCompletions([proposal(3, ['bike-thr-short-3x8'])], [thresholdRide(2)], config.profile),
    ).toEqual([])
  })

  it('takes nothing for a test that did not deliver its stimulus', () => {
    const vo2 = activity(2, 'Ride', {
      load: 75,
      movingTimeSec: 50 * 60,
      zoneSeconds: { Z5: 600, Z2: 1800 },
    })
    expect(matchedCompletions([proposal(2, ['test-bike-ftp20'])], [vo2], config.profile)).toEqual(
      [],
    )
  })

  it('does not take a few hard minutes for the whole session', () => {
    const surges = activity(2, 'Ride', {
      load: 60,
      movingTimeSec: 50 * 60,
      zoneSeconds: { Z2: 1800, Z4: 6 * 60, Z5: 7 * 60 },
    })
    const [match] = matchedCompletions(
      [proposal(2, ['bike-thr-short-3x8'])],
      [surges],
      config.profile,
    )
    expect(match?.evidence).toBe('similar')
  })

  it('cannot prove held work without zone data', () => {
    const blind = activity(2, 'Ride', {
      load: 70,
      intensity: 95,
      movingTimeSec: 50 * 60,
      zoneSeconds: {},
    })
    const [match] = matchedCompletions(
      [proposal(2, ['bike-thr-short-3x8'])],
      [blind],
      config.profile,
    )
    expect(match?.evidence).toBe('similar')
  })

  it('never takes a Zwift Racing League race for a proposed session', () => {
    const race = activity(2, 'Ride', {
      name: 'Zwift - Race: Zwift Racing League: City Showdown - Open Emerald League Division 2 (B) on Empire Elevation in New York',
      load: 66,
      movingTimeSec: 48 * 60,
      zoneSeconds: { Z1: 660, Z2: 900, Z3: 480, Z4: 240, Z5: 240, Z6: 240, Z7: 60, SS: 240 },
    })
    expect(
      matchedCompletions([proposal(2, ['bike-vo2-short-4x3'])], [race], config.profile),
    ).toEqual([])
  })

  it('ignores entries without load', () => {
    expect(
      matchedCompletions(
        [proposal(2, ['bike-thr-short-3x8'])],
        [thresholdRide(2, { load: 0 })],
        config.profile,
      ),
    ).toEqual([])
  })

  it('lets a calendar pairing win for the same activity', () => {
    const event = plannedEvent(2, 'egal', {
      externalId: `coach:${addDays(TODAY, -2)}:bike-thr-short-3x8`,
    })
    const ride = thresholdRide(2, { pairedEventId: event.id, compliance: 88 })
    const merged = mergeCompletions(
      completionsFrom([event], [ride]),
      matchedCompletions([proposal(2, ['bike-thr-short-3x8'])], [ride], config.profile),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ evidence: 'calendar', compliance: 88 })
  })
})
