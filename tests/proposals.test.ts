import { describe, expect, it } from 'vitest'
import { withProposal } from '../src/coach/proposals.ts'
import { validateConfig } from '../src/coach/config-schema.ts'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays } from '../src/coach/dates.ts'
import type { DayProposal, PlannedDay } from '../src/coach/types.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const rested = [
  activity(9, 'Ride', { load: 60, intensity: 70 }),
  activity(11, 'Run', { load: 50, intensity: 70 }),
]
const [planned] = planDays(
  buildState(rested, [wellness(0), ...baselineWellness()], TODAY),
  config,
  1,
)
const today = planned as PlannedDay
const ids = today.options.map((option) => option.template.id)
const recommendedId =
  today.options.find((option) => option.sport === today.recommended)?.template.id ?? null

describe('remembering what was proposed', () => {
  it("records today's options and recommendation", () => {
    expect(withProposal([], today)).toEqual([
      { date: TODAY, recommended: recommendedId, templateIds: ids },
    ])
  })

  it('keeps every option shown during the day, not only the latest', () => {
    const earlier: DayProposal = {
      date: TODAY,
      recommended: 'bike-vo2-4x4',
      templateIds: ['bike-vo2-4x4'],
    }
    const [entry] = withProposal([earlier], today)
    expect(entry?.templateIds).toEqual(['bike-vo2-4x4', ...ids])
  })

  it('stops changing the recommendation once something was trained', () => {
    const earlier: DayProposal = {
      date: TODAY,
      recommended: 'bike-vo2-4x4',
      templateIds: ['bike-vo2-4x4'],
    }
    const trained = {
      ...today,
      completed: [
        {
          activityId: 'a',
          name: 'x',
          sport: 'Ride' as const,
          load: 50,
          minutes: 50,
          compliance: null,
          templateId: null,
        },
      ],
    }
    expect(withProposal([earlier], trained)[0]?.recommended).toBe('bike-vo2-4x4')
  })

  it('returns the same list when nothing is new, so nothing gets written', () => {
    const once = withProposal([], today)
    expect(withProposal(once, today)).toBe(once)
  })

  it('forgets proposals older than progression can use', () => {
    const old = Array.from({ length: 130 }, (_unused, index): DayProposal => ({
      date: addDays(TODAY, -(index + 1)),
      recommended: null,
      templateIds: [],
    }))
    const kept = withProposal(old, today)
    expect(kept).toHaveLength(120)
    expect(kept[kept.length - 1]?.date).toBe(TODAY)
  })

  it('drops malformed stored entries instead of failing', () => {
    const stored = validateConfig({
      ...config,
      proposals: [
        { date: TODAY, recommended: null, templateIds: ['bike-thr-short-3x8'] },
        { date: 'gestern', recommended: null, templateIds: [] },
        { date: TODAY, recommended: 5, templateIds: 'x' },
      ],
    })
    expect(stored.proposals).toEqual([
      { date: TODAY, recommended: null, templateIds: ['bike-thr-short-3x8'] },
    ])
  })
})
