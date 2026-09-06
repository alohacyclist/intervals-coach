import type { AthleteProfile, CoachConfig, Goal, Sport, SportSetting, SportThreshold } from './types.ts'
import { ALL_SPORTS } from './types.ts'
import type { Equipment } from './types.ts'

export class ValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Ungültige Konfiguration: ${issues.join('; ')}`)
    this.name = 'ValidationError'
  }
}

const DEFAULT_CONFIG: CoachConfig = {
  profile: {
    equipment: 'dumbbells',
    sports: [
      { sport: 'Ride', threshold: { metric: 'power', ftp: 285 } },
      { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 236 } },
    ],
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
      currentValue: 285,
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
  strengthLog: [],
  planStart: new Date().toISOString().slice(0, 10),
}

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Earlier versions stored a single "sessions per week" number, which meant the
 * ceiling. Stored configurations are migrated in place rather than rejected.
 */
const normaliseWeeklySessions = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return { min: Math.max(1, Math.round(raw) - 1), max: Math.round(raw) }
  }
  return (raw ?? {}) as Record<string, unknown>
}

const isSport = (value: unknown): value is Sport =>
  typeof value === 'string' && (ALL_SPORTS as readonly string[]).includes(value)

const validateThreshold = (raw: unknown, where: string, issues: string[]): SportThreshold => {
  const threshold = (raw ?? {}) as Record<string, unknown>
  const metric = threshold['metric']

  if (metric === 'power') {
    if (!positive(threshold['ftp'])) issues.push(`${where}.ftp muss > 0 sein`)
    return { metric: 'power', ftp: Number(threshold['ftp']) }
  }
  if (metric === 'pace') {
    if (!positive(threshold['thresholdSecPerKm'])) issues.push(`${where}.thresholdSecPerKm muss > 0 sein`)
    return { metric: 'pace', thresholdSecPerKm: Number(threshold['thresholdSecPerKm']) }
  }
  if (metric === 'swimPace') {
    if (!positive(threshold['cssSecPer100m'])) issues.push(`${where}.cssSecPer100m muss > 0 sein`)
    return { metric: 'swimPace', cssSecPer100m: Number(threshold['cssSecPer100m']) }
  }

  issues.push(`${where}.metric muss power, pace oder swimPace sein`)
  return { metric: 'power', ftp: 0 }
}

/**
 * Configurations written before the app supported more than two sports carried
 * a flat `ftp` and `thresholdPaceSecPerKm`. They are migrated, not rejected.
 */
const normaliseSports = (profile: Record<string, unknown>): readonly unknown[] => {
  if (Array.isArray(profile['sports'])) return profile['sports']
  const legacy: SportSetting[] = []
  if (positive(profile['ftp'])) {
    legacy.push({ sport: 'Ride', threshold: { metric: 'power', ftp: Number(profile['ftp']) } })
  }
  if (positive(profile['thresholdPaceSecPerKm'])) {
    legacy.push({
      sport: 'Run',
      threshold: { metric: 'pace', thresholdSecPerKm: Number(profile['thresholdPaceSecPerKm']) },
    })
  }
  return legacy
}

const validateSports = (raw: unknown, issues: string[]): readonly SportSetting[] => {
  const entries = Array.isArray(raw) ? raw : []
  if (entries.length === 0) issues.push('profile.sports braucht mindestens eine Sportart')

  const settings = entries.map((entry, index) => {
    const setting = (entry ?? {}) as Record<string, unknown>
    const where = `profile.sports[${index}]`
    if (!isSport(setting['sport'])) issues.push(`${where}.sport muss Ride, Run oder Swim sein`)
    return {
      sport: (isSport(setting['sport']) ? setting['sport'] : 'Ride') as Sport,
      threshold: validateThreshold(setting['threshold'], `${where}.threshold`, issues),
    }
  })

  const seen = new Set(settings.map((setting) => setting.sport))
  if (seen.size !== settings.length) issues.push('profile.sports darf jede Sportart nur einmal enthalten')
  return settings
}

const validateProfile = (raw: unknown, issues: string[]): AthleteProfile => {
  const profile = (raw ?? {}) as Record<string, unknown>
  const sports = validateSports(normaliseSports(profile), issues)
  if (!positive(profile['weightKg'])) issues.push('profile.weightKg muss > 0 sein')
  const sessions = normaliseWeeklySessions(profile['weeklySessions'])
  if (!positive(sessions['min'])) issues.push('profile.weeklySessions.min muss > 0 sein')
  if (!positive(sessions['max'])) issues.push('profile.weeklySessions.max muss > 0 sein')
  if (positive(sessions['min']) && positive(sessions['max']) && Number(sessions['min']) > Number(sessions['max'])) {
    issues.push('profile.weeklySessions.min darf nicht über max liegen')
  }
  if (!positive(profile['maxSessionMinutes'])) issues.push('profile.maxSessionMinutes muss > 0 sein')

  const equipment = profile['equipment']
  const validEquipment: Equipment =
    equipment === 'gym' || equipment === 'dumbbells' || equipment === 'bodyweight'
      ? equipment
      : // Assume the least equipment rather than prescribing what cannot be done.
        'dumbbells'

  return {
    sports,
    equipment: validEquipment,
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

/** Dates only, deduplicated, newest last, and bounded so KV never grows unchecked. */
const MAX_STRENGTH_LOG = 400

const validateStrengthLog = (raw: unknown): readonly string[] => {
  const entries = Array.isArray(raw) ? raw : []
  return [...new Set(entries.filter(isIsoDate))].sort().slice(-MAX_STRENGTH_LOG)
}

export const validateConfig = (raw: unknown): CoachConfig => {
  const issues: string[] = []
  const input = (raw ?? {}) as Record<string, unknown>
  const goalsInput = Array.isArray(input['goals']) ? input['goals'] : []
  if (goalsInput.length === 0) issues.push('Mindestens ein Ziel wird benötigt')

  const config: CoachConfig = {
    profile: validateProfile(input['profile'], issues),
    goals: goalsInput.map((goal, index) => validateGoal(goal, index, issues)),
    strengthLog: validateStrengthLog(input['strengthLog']),
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
