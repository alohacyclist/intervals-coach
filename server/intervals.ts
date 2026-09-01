import type { Activity, Sport, Wellness } from '../src/coach/types.ts'

/**
 * Credentials for one athlete. A personal API key covers the single user setup;
 * OAuth bearer tokens are what intervals.icu requires for multi user apps.
 */
export type IntervalsAuth =
  | { readonly kind: 'apiKey'; readonly apiKey: string; readonly athleteId: string }
  | { readonly kind: 'bearer'; readonly accessToken: string; readonly athleteId: string }

const BASE_URL = 'https://intervals.icu/api/v1'

const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'])
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun', 'Treadmill'])

export class IntervalsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'IntervalsError'
  }
}

// btoa exists in both Node and workerd, unlike Buffer.
const authHeader = (auth: IntervalsAuth): string =>
  auth.kind === 'bearer' ? `Bearer ${auth.accessToken}` : `Basic ${btoa(`API_KEY:${auth.apiKey}`)}`

const request = async <T>(
  auth: IntervalsAuth,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(auth),
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const hint =
      response.status === 401 || response.status === 403
        ? ' — API-Key oder Athlete-ID prüfen (intervals.icu → Settings → Developer).'
        : ''
    throw new IntervalsError(`intervals.icu ${response.status}: ${body.slice(0, 300)}${hint}`, response.status)
  }

  return response.status === 204 ? (null as T) : ((await response.json()) as T)
}

const toSport = (type: unknown): Sport | 'Other' => {
  if (typeof type !== 'string') return 'Other'
  if (RIDE_TYPES.has(type)) return 'Ride'
  if (RUN_TYPES.has(type)) return 'Run'
  return 'Other'
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const nullableNum = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

type RawActivity = Record<string, unknown>
type RawWellness = Record<string, unknown>

const mapActivity = (raw: RawActivity): Activity => ({
  id: String(raw['id'] ?? ''),
  source: typeof raw['source'] === 'string' ? raw['source'] : null,
  date: String(raw['start_date_local'] ?? '').slice(0, 10),
  sport: toSport(raw['type']),
  name: String(raw['name'] ?? ''),
  load: num(raw['icu_training_load']),
  intensity: num(raw['icu_intensity']),
  movingTimeSec: num(raw['moving_time']),
})

const mapWellness = (raw: RawWellness): Wellness => ({
  date: String(raw['id'] ?? '').slice(0, 10),
  hrv: nullableNum(raw['hrv']),
  restingHr: nullableNum(raw['restingHR']),
  sleepSecs: nullableNum(raw['sleepSecs']),
  fatigue: nullableNum(raw['fatigue']),
  soreness: nullableNum(raw['soreness']),
})

export const fetchActivities = async (
  auth: IntervalsAuth,
  oldest: string,
  newest: string,
): Promise<readonly Activity[]> => {
  const raw = await request<RawActivity[]>(
    auth,
    `/athlete/${auth.athleteId}/activities?oldest=${oldest}&newest=${newest}`,
  )
  return (raw ?? []).map(mapActivity).filter((activity) => activity.date.length === 10)
}

export const fetchWellness = async (
  auth: IntervalsAuth,
  oldest: string,
  newest: string,
): Promise<readonly Wellness[]> => {
  const raw = await request<RawWellness[]>(
    auth,
    `/athlete/${auth.athleteId}/wellness?oldest=${oldest}&newest=${newest}`,
  )
  return (raw ?? []).map(mapWellness).filter((entry) => entry.date.length === 10)
}

export type SportSettings = {
  readonly ftp: number | null
  readonly thresholdPaceSecPerKm: number | null
  readonly lthr: number | null
  readonly maxHr: number | null
}

/** Reads FTP and threshold pace straight from intervals.icu so the plan uses the same numbers. */
export const fetchSportSettings = async (auth: IntervalsAuth): Promise<SportSettings> => {
  const raw = await request<Record<string, unknown>[]>(auth, `/athlete/${auth.athleteId}/sport-settings`)
  const forSport = (sport: Sport) =>
    (raw ?? []).find((entry) => {
      const types = entry['types']
      return Array.isArray(types) && types.some((type) => toSport(type) === sport)
    })

  const ride = forSport('Ride')
  const run = forSport('Run')
  const thresholdSpeed = nullableNum(run?.['threshold_pace'])

  return {
    ftp: nullableNum(ride?.['ftp']),
    // intervals.icu stores threshold pace as metres per second.
    thresholdPaceSecPerKm: thresholdSpeed && thresholdSpeed > 0 ? Math.round(1000 / thresholdSpeed) : null,
    lthr: nullableNum(ride?.['lthr']),
    maxHr: nullableNum(ride?.['max_hr']),
  }
}

export type CalendarEvent = {
  readonly date: string
  readonly sport: Sport
  readonly name: string
  readonly description: string
  readonly movingTimeSec: number
}

export const createWorkoutEvent = async (auth: IntervalsAuth, event: CalendarEvent): Promise<unknown> =>
  request(auth, `/athlete/${auth.athleteId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      category: 'WORKOUT',
      start_date_local: `${event.date}T00:00:00`,
      type: event.sport,
      name: event.name,
      description: event.description,
      moving_time: event.movingTimeSec,
    }),
  })
