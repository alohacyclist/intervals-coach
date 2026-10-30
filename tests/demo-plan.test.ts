import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiRoutes } from '../server/routes.ts'
import { demoData, fixtureSource } from '../server/demo/source.ts'
import type { CoachConfig } from '../src/coach/types.ts'

/**
 * The planner on the demo data, through the same routes an athlete's browser
 * calls. Run on every day of one week, because the demo is laid out relative to
 * today and must tell its story whatever day someone opens it.
 */
const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']

const routesOn = (today: string) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${today}T08:00:00Z`))
  const data = demoData(today)
  let stored: CoachConfig = data.config
  const app = createApiRoutes(async () => ({
    source: fixtureSource(data),
    store: { load: async () => stored, save: async (config) => (stored = config) },
  }))
  const get = async (path: string) => (await app.request(path)).json() as Promise<Record<string, any>>
  return { app, data, get }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('planner on demo data', () => {
  it.each(WEEK)('plans three days on %s around the session that was missed', async (today) => {
    const { get } = routesOn(today)
    const plan = await get('/api/plan')

    expect(plan['days']).toHaveLength(3)
    expect(plan['days'][0].date).toBe(today)
    // The gap is on record for the visitor to see…
    expect(plan['history'].some((day: { status: string }) => day.status === 'missed')).toBe(true)
    // …and the plan works around it: quality is still on offer, and never two hard days in a row.
    const types = plan['days'].map((day: { dayType: string }) => day.dayType)
    expect(types).toContain('KEY')
    for (let index = 1; index < types.length; index += 1) {
      expect(types[index - 1] === 'KEY' && types[index] === 'KEY').toBe(false)
    }
    expect(plan['state'].readiness.score).not.toBe('red')
  })

  it('recommends today what the missed day was meant to give, once the week has room', async () => {
    // Friday: Thursday's threshold run did not happen; today offers it again.
    const { get } = routesOn('2026-10-23')
    const plan = await get('/api/plan')
    const missed = plan['history'].find((day: { status: string }) => day.status === 'missed')
    const today = plan['days'][0]
    const recommended = today.options.find((option: { sport: string }) => option.sport === today.recommended)
    expect(recommended.template.name).toBe(missed.planned[0])
  })

  it('shows weeks of history with a recovery week, levels and a reference session', async () => {
    const { get } = routesOn('2026-10-21')
    const progress = await get('/api/progress')
    const loads = progress['weeks'].map((week: { load: number }) => week.load)
    expect(loads.filter((load: number) => load > 0).length).toBeGreaterThanOrEqual(20)
    const recent = loads.slice(-6, -1)
    expect(Math.min(...recent)).toBeLessThan(Math.max(...recent) * 0.75)
    expect(progress['levels'].length).toBeGreaterThan(0)
    expect(progress['benchmark'].due).toBe(false)
  })

  it('compares a session with its plan and finds the faulty heart recording, without offering to write it', async () => {
    const { app, data } = routesOn('2026-10-21')
    const faulty = [...data.sessions.values()].find((session) => session.heartFault)!
    const response = await app.request(
      `/api/execution/${faulty.activity.id}?template=${faulty.template.id}&date=${faulty.activity.date}`,
    )
    const execution = (await response.json()) as Record<string, any>
    expect(response.status).toBe(200)
    expect(execution['workDoneSeconds']).toBe(execution['workPlannedSeconds'])
    expect(execution['heart'].spans).toHaveLength(1)
    expect(execution['heart'].writable).not.toBe(true)
  })

  it('answers a tap on "send to calendar" with the demo note instead of reaching anywhere', async () => {
    const { app } = routesOn('2026-10-21')
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    const response = await app.request('/api/push', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-10-21', templateId: 'bike-vo2-5x4' }),
    })
    vi.unstubAllGlobals()
    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: string }).error).toMatch(/Demo mit Beispieldaten/)
    expect(network).not.toHaveBeenCalled()
  })

  it('lengthens today on a day with more time, and only today', async () => {
    const stretchedOn = await Promise.all(
      WEEK.map(async (date) => {
        const plan = await routesOn(date).get('/api/plan?minutes=180')
        vi.useRealTimers()
        const added = (day: Record<string, any>) =>
          day['options'].some((option: Record<string, any>) => option['variants'].some((variant: Record<string, any>) => variant['tier'] === 'extra'))
        expect(plan['days'].slice(1).some(added)).toBe(false)
        return added(plan['days'][0])
      }),
    )
    expect(stretchedOn.some(Boolean)).toBe(true)
  })

  it('ignores a time wish that is no number of minutes', async () => {
    const { get } = routesOn('2026-10-21')
    const usual = await get('/api/plan')
    const odd = await get('/api/plan?minutes=lang')
    expect(odd['days']).toEqual(usual['days'])
  })

  it('keeps a declared break in the plan, as the real app does', async () => {
    const { app, get } = routesOn('2026-10-21')
    const response = await app.request('/api/break', { method: 'POST', body: JSON.stringify({ kind: 'illness', days: 3 }) })
    expect(response.status).toBe(200)
    const plan = await get('/api/plan')
    expect(plan['days'].every((day: { dayType: string }) => day.dayType !== 'KEY')).toBe(true)
  })
})
