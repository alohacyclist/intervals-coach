import type { AthleteProfile, CoachConfig, Goal } from './types.ts'

export class ValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Ungültige Konfiguration: ${issues.join('; ')}`)
    this.name = 'ValidationError'
  }
}

const DEFAULT_CONFIG: CoachConfig = {
  profile: {
    ftp: 280,
    thresholdPaceSecPerKm: 236,
    weightKg: 71,
    maxHr: null,
    lthr: null,
    weeklySessions: { min: 2, max: 3 },
    maxSessionMinutes: 75,
  },
  goals: [
    {
      id: 'ftp-300',
      sport: 'Ride',
      kind: 'ftp',
      label: 'FTP 300W',
      targetValue: 300,
      currentValue: 280,
      targetDate: '2026-11-30',
      priority: 'A',
    },
    {
      id: '10k-sub36',
      sport: 'Run',
      kind: 'raceTime',
      label: '10km unter 36:00',
      targetValue: 2160,
      currentValue: 2280,
      distanceKm: 10,
      targetDate: '2027-05-31',
      priority: 'A',
    },
  ],
  planStart: new Date().toISOString().slice(0, 10),
}

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const validateProfile = (raw: unknown, issues: string[]): AthleteProfile => {
  const profile = (raw ?? {}) as Record<string, unknown>
  if (!positive(profile['ftp'])) issues.push('profile.ftp muss > 0 sein')
  if (!positive(profile['thresholdPaceSecPerKm'])) issues.push('profile.thresholdPaceSecPerKm muss > 0 sein')
  if (!positive(profile['weightKg'])) issues.push('profile.weightKg muss > 0 sein')
  const sessions = (profile['weeklySessions'] ?? {}) as Record<string, unknown>
  if (!positive(sessions['min'])) issues.push('profile.weeklySessions.min muss > 0 sein')
  if (!positive(sessions['max'])) issues.push('profile.weeklySessions.max muss > 0 sein')
  if (positive(sessions['min']) && positive(sessions['max']) && Number(sessions['min']) > Number(sessions['max'])) {
    issues.push('profile.weeklySessions.min darf nicht über max liegen')
  }
  if (!positive(profile['maxSessionMinutes'])) issues.push('profile.maxSessionMinutes muss > 0 sein')

  return {
    ftp: Number(profile['ftp']),
    thresholdPaceSecPerKm: Number(profile['thresholdPaceSecPerKm']),
    weightKg: Number(profile['weightKg']),
    maxHr: positive(profile['maxHr']) ? Number(profile['maxHr']) : null,
    lthr: positive(profile['lthr']) ? Number(profile['lthr']) : null,
    weeklySessions: { min: Number(sessions['min']), max: Number(sessions['max']) },
    maxSessionMinutes: Number(profile['maxSessionMinutes']),
  }
}

const validateGoal = (raw: unknown, index: number, issues: string[]): Goal => {
  const goal = (raw ?? {}) as Record<string, unknown>
  const where = `goals[${index}]`
  if (goal['sport'] !== 'Ride' && goal['sport'] !== 'Run') issues.push(`${where}.sport muss Ride oder Run sein`)
  if (goal['kind'] !== 'ftp' && goal['kind'] !== 'raceTime') issues.push(`${where}.kind muss ftp oder raceTime sein`)
  if (!positive(goal['targetValue'])) issues.push(`${where}.targetValue muss > 0 sein`)
  if (!positive(goal['currentValue'])) issues.push(`${where}.currentValue muss > 0 sein`)
  if (goal['targetDate'] !== undefined && !isIsoDate(goal['targetDate'])) {
    issues.push(`${where}.targetDate muss YYYY-MM-DD sein`)
  }

  return {
    id: String(goal['id'] ?? `goal-${index}`),
    sport: goal['sport'] as Goal['sport'],
    kind: goal['kind'] as Goal['kind'],
    label: String(goal['label'] ?? 'Ziel'),
    targetValue: Number(goal['targetValue']),
    currentValue: Number(goal['currentValue']),
    ...(positive(goal['distanceKm']) ? { distanceKm: Number(goal['distanceKm']) } : {}),
    ...(isIsoDate(goal['targetDate']) ? { targetDate: goal['targetDate'] } : {}),
    priority: goal['priority'] === 'B' ? 'B' : 'A',
  }
}

export const validateConfig = (raw: unknown): CoachConfig => {
  const issues: string[] = []
  const input = (raw ?? {}) as Record<string, unknown>
  const goalsInput = Array.isArray(input['goals']) ? input['goals'] : []
  if (goalsInput.length === 0) issues.push('Mindestens ein Ziel wird benötigt')

  const config: CoachConfig = {
    profile: validateProfile(input['profile'], issues),
    goals: goalsInput.map((goal, index) => validateGoal(goal, index, issues)),
    planStart: isIsoDate(input['planStart']) ? input['planStart'] : DEFAULT_CONFIG.planStart,
  }

  if (issues.length > 0) throw new ValidationError(issues)
  return config
}

/** Raised when a user is authenticated but has not completed onboarding yet. */
export class MissingConfigError extends Error {
  constructor() {
    super('Onboarding noch nicht abgeschlossen')
    this.name = 'MissingConfigError'
  }
}

/** Persistence for the athlete configuration — file backed locally, KV in production. */
export type ConfigStore = {
  readonly load: () => Promise<CoachConfig>
  readonly save: (config: CoachConfig) => Promise<CoachConfig>
}

export { DEFAULT_CONFIG }
