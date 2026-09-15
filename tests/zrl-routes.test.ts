import { describe, expect, it } from 'vitest'
import { createApiRoutes } from '../server/routes.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import type { CoachConfig } from '../src/coach/types.ts'
import { ZWIFT_ROUTES } from '../server/zwift-routes.ts'
import { config } from './fixtures.ts'

const memoryStore = (initial: CoachConfig): ConfigStore & { current: () => CoachConfig } => {
  let stored = initial
  return {
    load: async () => stored,
    save: async (next) => {
      stored = next
      return next
    },
    current: () => stored,
  }
}

const appWith = (store: ConfigStore) =>
  createApiRoutes(async () => ({
    auth: { kind: 'apiKey' as const, apiKey: 'unused', athleteId: 'i0' },
    store,
  }))

const send = (app: ReturnType<typeof appWith>, method: string, path: string, body: unknown) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const risingEmpire = ZWIFT_ROUTES.find((route) => route.name === 'Rising Empire')

describe('entering a league round', () => {
  it('lists rideable routes with distance and climbing', () => {
    expect(risingEmpire).toMatchObject({ world: 'New York', distanceKm: 20.816, elevationM: 377 })
  })

  it('stores races with the route details taken from the route list', async () => {
    const store = memoryStore(config)
    const response = await send(appWith(store), 'PUT', '/api/zrl', {
      races: [
        { date: '2026-09-22', format: 'scratch', laps: 2, routeId: risingEmpire?.id },
        { date: '2026-09-29', format: 'ttt', laps: 1, routeId: null },
      ],
    })
    expect(response.status).toBe(200)
    expect(store.current().zrlRaces).toEqual([
      { date: '2026-09-22', format: 'scratch', laps: 2, route: risingEmpire },
      { date: '2026-09-29', format: 'ttt', laps: 1, route: null },
    ])
  })

  it('refuses an unknown route, a missing format and a doubled date', async () => {
    const store = memoryStore(config)
    const response = await send(appWith(store), 'PUT', '/api/zrl', {
      races: [
        { date: '2026-09-22', format: 'scratch', laps: 1, routeId: 1 },
        { date: '2026-09-29', format: '', laps: 1, routeId: null },
        { date: '2026-09-29', format: 'ttt', laps: 1, routeId: null },
      ],
    })
    const body = (await response.json()) as { error: string }
    expect(response.status).toBe(400)
    expect(body.error).toContain('Route unbekannt')
    expect(body.error).toContain('ungültig')
    expect(body.error).toContain('doppelt')
    expect(store.current().zrlRaces).toEqual([])
  })

  it('keeps the round when the settings form saves an older copy', async () => {
    const race = { date: '2026-09-22', format: 'ttt' as const, laps: 1, route: null }
    const store = memoryStore({ ...config, zrlRaces: [race] })
    const response = await send(appWith(store), 'PUT', '/api/config', { ...config, zrlRaces: [] })
    expect(response.status).toBe(200)
    expect(store.current().zrlRaces).toEqual([race])
  })
})
