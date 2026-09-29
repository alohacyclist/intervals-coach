import { describe, expect, it } from 'vitest'
import { FIRST_HOUR, MAX_INTERVAL_MINUTES, pendingDates, shouldCheck } from '../worker/strava-schedule.ts'
import { localMinuteOfDay } from '../worker/strava-cron.ts'
import type { DayProposal } from '../src/coach/types.ts'

const TODAY = '2026-09-24'
const YESTERDAY = '2026-09-23'
const at = (iso: string) => new Date(iso)
const proposed = (date: string, templateIds: readonly string[] = ['bike-thr-3x12']): DayProposal => ({
  date,
  recommended: templateIds[0] ?? null,
  templateIds,
})

describe('which days can still be waiting for a summary', () => {
  it('is a proposed day', () => {
    expect(pendingDates([proposed(TODAY)], TODAY, 18)).toEqual([TODAY])
  })

  it('never is a day the app proposed nothing for, or only a rest day', () => {
    expect(pendingDates([], TODAY, 18)).toEqual([])
    expect(pendingDates([proposed(TODAY, [])], TODAY, 18)).toEqual([])
  })

  it('keeps yesterday open through the morning only', () => {
    const proposals = [proposed(YESTERDAY), proposed(TODAY)]
    expect(pendingDates(proposals, TODAY, 8)).toEqual([TODAY, YESTERDAY])
    expect(pendingDates(proposals, TODAY, 13)).toEqual([TODAY])
  })
})

describe('when the cron looks', () => {
  const FIRST_MINUTE = FIRST_HOUR * 60
  const look = (minuteOfDay: number, lastPostedAt: string | null = null, now = at('2026-09-24T12:00:00Z')) =>
    shouldCheck({ now, minuteOfDay, pending: [TODAY], lastPostedAt })

  it('not at all without a pending day, and not at night', () => {
    expect(shouldCheck({ now: at('2026-09-24T16:00:00Z'), minuteOfDay: 18 * 60, pending: [], lastPostedAt: null })).toBe(false)
    expect(look(FIRST_MINUTE - 30)).toBe(false)
  })

  it('at once when the day starts', () => {
    expect(look(FIRST_MINUTE, '2026-09-23T19:00:00Z')).toBe(true)
  })

  it('less often the longer the day stays quiet, at most every two hours', () => {
    const runs = Array.from({ length: 36 }, (_, slot) => FIRST_MINUTE + slot * 30)
    expect(runs.filter((minute) => look(minute)).map((minute) => minute - FIRST_MINUTE)).toEqual([
      0, 30, 90, 210, 330, 450, 570, 690, 810, 930, 1050,
    ])
    expect(MAX_INTERVAL_MINUTES).toBe(120)
  })

  it('once per slot even when a run starts a few minutes late', () => {
    expect([2, 32, 62, 92].map((late) => look(FIRST_MINUTE + late))).toEqual([true, true, false, true])
  })

  it('soon again after a summary was written, for the next session of the day', () => {
    // 20:00 and 20:30 in Berlin: neither is a look of the quiet day.
    expect(look(20 * 60, '2026-09-24T17:30:00Z', at('2026-09-24T18:00:00Z'))).toBe(true)
    expect(look(20 * 60 + 30, '2026-09-24T17:30:00Z', at('2026-09-24T18:30:00Z'))).toBe(false)
    expect(look(21 * 60, '2026-09-24T17:30:00Z', at('2026-09-24T19:00:00Z'))).toBe(true)
  })
})

describe('the athlete’s minute of the day', () => {
  it('counts from local midnight, half-hour zones included', () => {
    expect(localMinuteOfDay(at('2026-09-24T04:15:00Z'))).toBe(6 * 60 + 15)
    expect(localMinuteOfDay(at('2026-09-24T04:15:00Z'), 'Asia/Kathmandu')).toBe(10 * 60)
  })
})
