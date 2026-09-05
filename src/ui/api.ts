import type { CoachConfig, Plan } from '../coach/types.ts'

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
}

export type SportSettings = {
  readonly ftp: number | null
  readonly thresholdPaceSecPerKm: number | null
}

export const getMe = (): Promise<Me> => request<Me>('/api/me')

export const getSportSettings = (): Promise<SportSettings> =>
  request<SportSettings>('/api/sport-settings')

export const getPlan = (days: number): Promise<Plan> => request<Plan>(`/api/plan?days=${days}`)

export const getConfig = (): Promise<CoachConfig> => request<CoachConfig>('/api/config')

export const putConfig = (config: CoachConfig): Promise<CoachConfig> =>
  request<CoachConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config) })

export const syncSettings = (): Promise<{ config: CoachConfig }> =>
  request<{ config: CoachConfig }>('/api/sync-settings', { method: 'POST' })

export const adoptThreshold = (sport: string, observed: number): Promise<unknown> =>
  request('/api/threshold', { method: 'POST', body: JSON.stringify({ sport, observed }) })

export const pushWorkout = (date: string, templateId: string): Promise<{ name: string }> =>
  request<{ name: string }>('/api/push', {
    method: 'POST',
    body: JSON.stringify({ date, templateId }),
  })
