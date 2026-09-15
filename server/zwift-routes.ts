import { routes, worlds } from 'zwift-data'
import type { ZwiftRoute } from '../src/coach/types.ts'

const WORLD_NAMES = new Map<string, string>(worlds.map((world) => [world.slug, world.name]))

/** Every route a league race can use: the ones that can be ridden, sorted for picking. */
export const ZWIFT_ROUTES: readonly ZwiftRoute[] = routes
  .filter((route) => route.sports.includes('cycling'))
  .flatMap((route) => (route.id === undefined ? [] : [{ ...route, id: route.id }]))
  .map((route) => ({
    id: route.id,
    name: route.name,
    world: WORLD_NAMES.get(route.world) ?? route.world,
    distanceKm: route.distance,
    elevationM: route.elevation,
    leadInKm: route.leadInDistance ?? 0,
    leadInElevationM: route.leadInElevation ?? 0,
  }))
  .sort((left, right) => left.name.localeCompare(right.name, 'de'))

export const findRoute = (id: number): ZwiftRoute | null =>
  ZWIFT_ROUTES.find((route) => route.id === id) ?? null
