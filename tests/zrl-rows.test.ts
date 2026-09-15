import { describe, expect, it } from 'vitest'
import { nextTuesday, racesFrom, routeLabel, withRound } from '../src/ui/zrl-rows.ts'
import type { ZwiftRoute } from '../src/coach/types.ts'

const route = (id: number, name: string, world: string): ZwiftRoute => ({
  id,
  name,
  world,
  distanceKm: 20,
  elevationM: 200,
  leadInKm: 0.5,
  leadInElevationM: 5,
})

const routes = [
  route(1, 'Rising Empire', 'New York'),
  route(2, 'Loop', 'London'),
  route(3, 'Loop', 'Watopia'),
]

describe('entering a round', () => {
  it('starts from the next Tuesday', () => {
    expect(nextTuesday('2026-09-15')).toBe('2026-09-15')
    expect(nextTuesday('2026-09-16')).toBe('2026-09-22')
  })

  it('adds one date a week and keeps what is already there', () => {
    const existing = [
      { date: '2026-09-29', format: 'ttt' as const, route: 'Loop · London', laps: 1 },
    ]
    const rows = withRound(existing, '2026-09-22', 3)
    expect(rows.map((row) => row.date)).toEqual(['2026-09-22', '2026-09-29', '2026-10-06'])
    expect(rows[1]).toEqual(existing[0])
  })

  it('turns rows into races, route optional', () => {
    const result = racesFrom(
      [
        {
          date: '2026-09-22',
          format: 'scratch',
          route: routeLabel(routes[0] as ZwiftRoute),
          laps: 2,
        },
        { date: '2026-09-29', format: 'points', route: 'rising empire', laps: 1 },
        { date: '2026-10-06', format: 'ttt', route: '  ', laps: 0 },
      ],
      routes,
    )
    expect(result).toEqual({
      races: [
        { date: '2026-09-22', format: 'scratch', laps: 2, routeId: 1 },
        { date: '2026-09-29', format: 'points', laps: 1, routeId: 1 },
        { date: '2026-10-06', format: 'ttt', laps: 1, routeId: null },
      ],
    })
  })

  it('names what is missing instead of saving half a round', () => {
    const result = racesFrom(
      [
        { date: '2026-09-22', format: '', route: '', laps: 1 },
        { date: '2026-09-29', format: 'scratch', route: 'Loop', laps: 1 },
      ],
      routes,
    )
    expect(result).toEqual({ error: expect.stringContaining('22.09.: Format fehlt') })
    expect('error' in result && result.error).toContain('29.09.: Route „Loop" nicht gefunden')
  })
})
