import { describe, expect, it } from 'vitest'
import { createApiRoutes, localToday } from '../server/routes.ts'
import { demoData, fixtureSource } from '../server/demo/source.ts'
import type { CalendarEvent } from '../server/intervals.ts'
import type { IntervalsSource } from '../server/source.ts'
import type { CoachConfig } from '../src/coach/types.ts'

/** The demo athlete, with a calendar that takes what is sent instead of refusing it. */
const appWithCalendar = () => {
  const data = demoData(localToday())
  const sent: CalendarEvent[] = []
  const base = fixtureSource(data)
  const source: IntervalsSource = {
    ...base,
    applyDestinations: async () => [],
    createWorkout: async (event) => {
      sent.push(event)
      return {}
    },
    fresh: () => source,
  }
  let stored: CoachConfig = data.config
  const app = createApiRoutes(async () => ({
    source,
    store: { load: async () => stored, save: async (config) => (stored = config) },
  }))
  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { post, sent, goals: data.config.goals }
}

describe('sending the race plan to the watch', () => {
  it('puts the race goal with its pacing on its day', async () => {
    const { post, sent, goals } = appWithCalendar()
    const goal = goals.find((entry) => entry.kind === 'raceTime' && entry.sport === 'Run')!
    const response = await post('/api/race-plan', { goalId: goal.id })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ date: goal.targetDate, alreadyScheduled: false })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ date: goal.targetDate, sport: 'Run', templateId: 'goal-race' })
    // Warm-up, then the stretches by distance with absolute pace ranges.
    expect(sent[0]?.description).toMatch(/- 4km \d:\d\d-\d:\d\d\/km Pace/)
  })

  it('refuses a goal without a race day ahead', async () => {
    const { post } = appWithCalendar()
    const response = await post('/api/race-plan', { goalId: 'unknown' })
    expect(response.status).toBe(400)
  })

  it('takes race day from the plan’s push as well', async () => {
    const { post, sent, goals } = appWithCalendar()
    const goal = goals.find((entry) => entry.kind === 'raceTime' && entry.sport === 'Run')!
    const response = await post('/api/push', { date: goal.targetDate, templateId: 'goal-race' })
    expect(response.status).toBe(200)
    expect(sent[0]?.templateId).toBe('goal-race')
  })
})
