import { describe, expect, it } from 'vitest'
import type { AdherenceDay, PlannedDay } from '../src/coach/types.ts'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { dayState, pastRows, planRow } from '../src/ui/week-line.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const history = (date: string, patch: Partial<AdherenceDay> = {}): AdherenceDay =>
  ({
    date,
    weekday: 'Mo',
    status: 'rest',
    planned: [],
    completed: null,
    completedSport: null,
    templateId: null,
    load: null,
    ...patch,
  }) as AdherenceDay

const baseCompleted = { name: 'Morgenrunde', sport: 'Ride', minutes: 0, load: 0 } as PlannedDay['completed'][number]

const plannedDays = planDays(
  buildState([activity(9, 'Ride'), activity(11, 'Run')], [wellness(0), ...baselineWellness()], TODAY),
  config,
  7,
)

describe('dayState', () => {
  it('gives recovery the colour of an easy day, because colour only means intensity', () => {
    expect(dayState('RECOVERY')).toBe('easy')
    expect(dayState('KEY')).toBe('key')
    expect(dayState('REST')).toBe('rest')
  })
})

describe('pastRows', () => {
  // 2026-10-31 is a Saturday, 2026-10-26 its Monday.
  const saturday = '2026-10-31'

  it('keeps this week before today and nothing else', () => {
    const rows = pastRows(
      [history('2026-10-25'), history('2026-10-26'), history('2026-10-30'), history(saturday)],
      saturday,
    )
    expect(rows.map((row) => row.date)).toEqual(['2026-10-26', '2026-10-30'])
  })

  it('has nothing to show on a Monday', () => {
    expect(pastRows([history('2026-10-25')], '2026-10-26')).toEqual([])
  })

  it('names the planned session of a missed day without inventing a sport', () => {
    const [row] = pastRows([history('2026-10-29', { status: 'missed', planned: ['Schwelle', 'Lauf'] })], saturday)
    expect(row).toMatchObject({ mark: 'missed', sport: null, title: 'Schwelle oder Lauf', load: null })
  })

  it('leaves the intensity neutral when the training matches no known template', () => {
    const [row] = pastRows(
      [
        history('2026-10-28', {
          status: 'unplanned',
          completed: 'Pendeln',
          completedSport: 'Ride',
          templateId: 'no-such-template',
          load: 30,
        }),
      ],
      saturday,
    )
    expect(row).toMatchObject({ mark: 'neutral', sport: 'Ride', title: 'Pendeln', load: 30 })
  })

  it('shows no sport icon for a sport the app has no icon for', () => {
    const [row] = pastRows([history('2026-10-28', { status: 'unplanned', completedSport: 'Other' })], saturday)
    expect(row?.sport).toBeNull()
  })
})

describe('planRow', () => {
  const trainable = plannedDays.find((day) => day.recommended !== 'REST')!

  it('leads with the recommended session of the day', () => {
    const pick = trainable.options.find((option) => option.sport === trainable.recommended)!
    expect(planRow(trainable)).toMatchObject({ sport: pick.sport, date: trainable.date })
    expect(planRow(trainable).note).toMatch(/^\d+ min$/)
  })

  it('shows what was trained once a day is done, summed over its sessions', () => {
    const done: PlannedDay = {
      ...trainable,
      completed: [
        { ...baseCompleted, minutes: 30.4, load: 20.2 },
        { ...baseCompleted, name: '', minutes: 20, load: 10 },
      ],
    }
    expect(planRow(done)).toMatchObject({
      title: 'Morgenrunde · Einheit ohne Namen',
      load: 30,
      note: '✓ 50 min',
      sport: 'Ride',
    })
  })

  it('reads a day without any pick as a rest stop', () => {
    const rest: PlannedDay = { ...trainable, recommended: 'REST', dayType: 'REST', options: [], completed: [] }
    expect(planRow(rest)).toMatchObject({ mark: 'rest', sport: null, title: 'Ruhetag', load: null })
  })

  it('says so when a day has no proposal instead of showing a stale session', () => {
    const none: PlannedDay = { ...trainable, options: [], completed: [] }
    expect(planRow(none)).toMatchObject({ mark: 'rest', title: 'Kein Vorschlag' })
  })
})
