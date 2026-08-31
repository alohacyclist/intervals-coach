import type { CoachConfig, Plan } from '../coach/types.ts'

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `Fehler ${response.status}`)
  }
  return payload as T
}

export const getPlan = (days: number): Promise<Plan> => request<Plan>(`/api/plan?days=${days}`)

export const getConfig = (): Promise<CoachConfig> => request<CoachConfig>('/api/config')

export const putConfig = (config: CoachConfig): Promise<CoachConfig> =>
  request<CoachConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config) })

export const syncSettings = (): Promise<{ config: CoachConfig }> =>
  request<{ config: CoachConfig }>('/api/sync-settings', { method: 'POST' })

export const pushWorkout = (date: string, templateId: string): Promise<{ name: string }> =>
  request<{ name: string }>('/api/push', {
    method: 'POST',
    body: JSON.stringify({ date, templateId }),
  })
