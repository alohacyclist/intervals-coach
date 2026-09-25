import type { SessionTier } from '../coach/types.ts'
import type { CoachConfig, Execution, Plan, Progress, ZrlSettings, ZwiftRoute } from '../coach/types.ts'
import type { ZrlRaceInput } from './zrl-rows.ts'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly needsLogin = false,
    readonly needsOnboarding = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    needsLogin?: boolean
    needsOnboarding?: boolean
  }
  if (!response.ok) {
    throw new ApiError(
      payload.error ?? `Fehler ${response.status}`,
      response.status,
      Boolean(payload.needsLogin),
      Boolean(payload.needsOnboarding),
    )
  }
  return payload as T
}

export type Me = {
  readonly mode: 'single' | 'multi'
  readonly authenticated: boolean
  readonly onboarded: boolean
  readonly name?: string
  readonly athleteId?: string
  /** Proof that consent was given, shown back to the athlete who gave it. */
  readonly consentAt?: string | null
}

export type SportSettings = {
  readonly ftp: number | null
  readonly thresholdPaceSecPerKm: number | null
}

export const getMe = (): Promise<Me> => request<Me>('/api/me')

/** Single user mode only: trades the shared password for a session cookie. */
export const login = (passwort: string): Promise<{ ok: true }> =>
  request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ passwort }) })

export const getSportSettings = (): Promise<SportSettings> =>
  request<SportSettings>('/api/sport-settings')

/** One completed session against the proposal it fulfilled; loaded when looked at. */
export const getExecution = (activityId: string, templateId: string, date: string): Promise<Execution> =>
  request<Execution>(
    `/api/execution/${encodeURIComponent(activityId)}?template=${encodeURIComponent(templateId)}&date=${date}`,
  )

export const getPlan = (days: number, intent?: string): Promise<Plan> =>
  request<Plan>(`/api/plan?days=${days}${intent ? `&intent=${intent}` : ''}`)

export const getProgress = (): Promise<Progress> => request<Progress>('/api/progress')

export const getConfig = (): Promise<CoachConfig> => request<CoachConfig>('/api/config')

export const putConfig = (config: CoachConfig): Promise<CoachConfig> =>
  request<CoachConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config) })

export const fetchZwiftRoutes = (): Promise<readonly ZwiftRoute[]> =>
  request<readonly ZwiftRoute[]>('/api/zwift-routes')

export const putZrlSettings = (settings: ZrlSettings): Promise<CoachConfig> =>
  request<CoachConfig>('/api/zrl-settings', { method: 'PUT', body: JSON.stringify(settings) })

export const putZrlRaces = (races: readonly ZrlRaceInput[]): Promise<CoachConfig> =>
  request<CoachConfig>('/api/zrl', { method: 'PUT', body: JSON.stringify({ races }) })

export const syncSettings = (): Promise<{ config: CoachConfig }> =>
  request<{ config: CoachConfig }>('/api/sync-settings', { method: 'POST' })

export const adoptThreshold = (sport: string, observed: number): Promise<unknown> =>
  request('/api/threshold', { method: 'POST', body: JSON.stringify({ sport, observed }) })

export const logStrength = (date: string, done: boolean): Promise<unknown> =>
  request('/api/strength', { method: 'POST', body: JSON.stringify({ date, done }) })

export const declareBreak = (kind: string, days: number): Promise<unknown> =>
  request('/api/break', { method: 'POST', body: JSON.stringify({ kind, days }) })

export const endBreak = (): Promise<unknown> => request('/api/break/end', { method: 'POST' })

export const pushWorkout = (
  date: string,
  templateId: string,
  variant: SessionTier = 'max',
): Promise<{ name: string; alreadyScheduled: boolean }> =>
  request<{ name: string; alreadyScheduled: boolean }>('/api/push', {
    method: 'POST',
    body: JSON.stringify({ date, templateId, variant }),
  })

export const deleteAccount = (): Promise<{ ok: boolean }> =>
  request<{ ok: boolean }>('/api/account', { method: 'DELETE' })

export type StravaStatus = {
  /** False when the operator has not set up a Strava app; the app then says nothing about Strava. */
  readonly available: boolean
  readonly connected: boolean
  readonly name: string | null
  /** intervals.icu activities whose summary is already on Strava. */
  readonly posted: readonly string[]
}

export type StravaOutcome = {
  readonly status: 'posted' | 'not-found' | 'no-comparison'
  readonly activityId: string
  readonly stravaId?: string
}

const NO_STRAVA: StravaStatus = { available: false, connected: false, name: null, posted: [] }

/** Several cards ask at once; one request answers them all until something changes. */
let stravaStatus: Promise<StravaStatus> | null = null

/** Anything but a real answer — the app shell from a static host, an old server — means no Strava. */
const asStravaStatus = (payload: Partial<StravaStatus>): StravaStatus =>
  typeof payload.available === 'boolean' && typeof payload.connected === 'boolean' && Array.isArray(payload.posted)
    ? { available: payload.available, connected: payload.connected, name: payload.name ?? null, posted: payload.posted }
    : NO_STRAVA

export const getStrava = (fresh = false): Promise<StravaStatus> => {
  if (fresh || stravaStatus === null) {
    // The local Node server has no Strava; that is "not set up", not an error.
    stravaStatus = request<Partial<StravaStatus>>('/api/strava').then(asStravaStatus, () => NO_STRAVA)
  }
  return stravaStatus
}

export const disconnectStrava = async (): Promise<StravaStatus> => {
  await request('/api/strava', { method: 'DELETE' })
  return getStrava(true)
}

export const postToStrava = async (activityId: string, templateId: string, date: string): Promise<StravaOutcome> => {
  const outcome = await request<StravaOutcome>('/api/strava/sessions', {
    method: 'POST',
    body: JSON.stringify({ activityId, templateId, date }),
  })
  if (outcome.status === 'posted') void getStrava(true)
  return outcome
}
