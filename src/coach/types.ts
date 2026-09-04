export type Sport = 'Ride' | 'Run' | 'Swim'

export const ALL_SPORTS: readonly Sport[] = ['Ride', 'Run', 'Swim'] as const

export const SPORT_LABELS: Readonly<Record<Sport, string>> = {
  Ride: 'Rad',
  Run: 'Laufen',
  Swim: 'Schwimmen',
}

/**
 * Every sport is steered by a different quantity. Keeping them in one union lets
 * the engine stay sport-agnostic while each sport keeps its own natural metric.
 */
export type SportThreshold =
  | { readonly metric: 'power'; readonly ftp: number }
  | { readonly metric: 'pace'; readonly thresholdSecPerKm: number }
  | { readonly metric: 'swimPace'; readonly cssSecPer100m: number }

export type SportSetting = {
  readonly sport: Sport
  readonly threshold: SportThreshold
}

/** Training phase derived from the distance to a goal date. */
export type Phase = 'BASE' | 'BUILD' | 'SPECIFIC' | 'TAPER' | 'RECOVERY'

/** What a session is meant to develop. */
export type Stimulus =
  | 'VO2'
  | 'THRESHOLD'
  | 'SWEETSPOT'
  | 'TEMPO'
  | 'NEURO'
  | 'ENDURANCE'
  | 'LONG'
  | 'RECOVERY'

export type IntensityClass = 'hard' | 'moderate' | 'easy'

export type WeeklySessions = {
  readonly min: number
  readonly max: number
}

export type AthleteProfile = {
  /** The sports this athlete trains, in the order they are shown. */
  readonly sports: readonly SportSetting[]
  readonly weightKg: number
  readonly maxHr: number | null
  readonly lthr: number | null
  /** Sessions per week: `min` is the commitment, `max` the ceiling time allows. */
  readonly weeklySessions: WeeklySessions
  /** Time budget for a single session in minutes. */
  readonly maxSessionMinutes: number
}

export type GoalKind = 'ftp' | 'raceTime'

export type Goal = {
  readonly id: string
  readonly sport: Sport
  readonly kind: GoalKind
  readonly label: string
  /** Watts for `ftp`, seconds for `raceTime`. */
  readonly targetValue: number
  /** Watts for `ftp`, seconds for `raceTime`. Current level at plan start. */
  readonly currentValue: number
  readonly distanceKm?: number
  /** ISO date (YYYY-MM-DD). Absent for open-ended goals. */
  readonly targetDate?: string
  readonly priority: 'A' | 'B'
}

export type CoachConfig = {
  readonly profile: AthleteProfile
  readonly goals: readonly Goal[]
  /** ISO date the plan started, anchors the 3:1 build/recovery cycle. */
  readonly planStart: string
}

export type Activity = {
  readonly id: string
  /** Where intervals.icu got the activity from — STRAVA payloads arrive empty. */
  readonly source: string | null
  readonly date: string
  readonly sport: Sport | 'Other'
  readonly name: string
  readonly load: number
  readonly intensity: number
  readonly movingTimeSec: number
  readonly isStrength: boolean
  /** Set by intervals.icu when this activity fulfilled a planned workout. */
  readonly pairedEventId: string | null
  /** Percentage match against the planned workout, 0–100. */
  readonly compliance: number | null
}

/** A workout on the intervals.icu calendar. */
export type PlannedEvent = {
  readonly id: string
  readonly date: string
  readonly name: string
  readonly sport: Sport | 'Other'
  readonly externalId: string | null
  readonly pairedActivityId: string | null
}

export type AdherenceStatus = 'done' | 'switched' | 'missed' | 'unplanned' | 'rest'

export type AdherenceDay = {
  readonly date: string
  readonly weekday: string
  readonly status: AdherenceStatus
  /** Names of the sessions this app proposed for that day. */
  readonly planned: readonly string[]
  /** What was actually trained, if anything. */
  readonly completed: string | null
  readonly completedSport: Sport | 'Other' | null
  readonly compliance: number | null
  readonly load: number
}

export type StrengthExercise = {
  readonly name: string
  readonly sets: string
  readonly load: string
}

export type StrengthSuggestion = {
  readonly name: string
  readonly minutes: number
  readonly note: string
  readonly exercises: readonly StrengthExercise[]
}

export type Wellness = {
  readonly date: string
  readonly hrv: number | null
  readonly restingHr: number | null
  readonly sleepSecs: number | null
  readonly fatigue: number | null
  readonly soreness: number | null
}

export type Fitness = {
  readonly ctl: number
  readonly atl: number
  readonly tsb: number
}

export type ReadinessScore = 'green' | 'amber' | 'red'

export type Readiness = {
  readonly score: ReadinessScore
  readonly reasons: readonly string[]
}

export type StimulusRecency = {
  readonly sport: Sport
  readonly stimulus: Stimulus
  readonly daysAgo: number
}

export type TrainingState = {
  readonly today: string
  readonly overall: Fitness
  readonly bySport: Readonly<Record<Sport, Fitness>>
  readonly daysSinceHard: Readonly<Record<Sport, number>>
  readonly hardSessionsLast7: number
  readonly hardSessionsThisWeek: number
  readonly sessionsThisWeek: number
  readonly hardThisWeekBySport: Readonly<Record<Sport, number>>
  readonly recentWorkoutNames: readonly string[]
  readonly loadLast7: number
  /** CTL change over the last 7 days. */
  readonly rampRate: number
  readonly readiness: Readiness
  readonly recency: readonly StimulusRecency[]
  /** The newest activity the plan was built from — makes stale data visible. */
  readonly lastActivity: RecentActivity | null
  /** Everything intervals.icu returned, including auto-detected walks. */
  readonly activityCount: number
  /** Only those carrying a training load — what the plan actually reacts to. */
  readonly loadedActivityCount: number
  readonly dataIssue: DataIssue | null
  /** Days since any session at all — a long gap changes how training resumes. */
  readonly daysSinceAnySession: number
  readonly strengthSessionsThisWeek: number
  /** Rest days immediately before today — three in a row start to cost fitness. */
  readonly consecutiveRestDays: number
}

/**
 * Something is wrong with the incoming data itself, not with the plan. Surfaced
 * to the athlete because the fix is in their intervals.icu account, not here.
 */
export type DataIssue = {
  readonly kind: 'strava-blocked' | 'no-load'
  readonly affected: number
  readonly total: number
}

export type RecentActivity = {
  readonly date: string
  readonly name: string
  readonly sport: Sport | 'Other'
  readonly load: number
  readonly daysAgo: number
}

export type Step = {
  readonly kind: 'step'
  readonly label?: string
  readonly duration: string
  readonly target: string
  readonly cadence?: string
}

export type Repeat = {
  readonly kind: 'repeat'
  readonly times: number
  readonly steps: readonly Step[]
}

export type Block = Step | Repeat

export type WorkoutTemplate = {
  readonly id: string
  readonly sport: Sport
  readonly stimulus: Stimulus
  readonly name: string
  readonly minutes: number
  readonly load: number
  readonly blocks: readonly Block[]
  readonly phases: readonly Phase[]
  readonly coachNote: string
}

export type DayType = 'KEY' | 'EASY' | 'RECOVERY' | 'REST'

export type PlannedSession = {
  readonly sport: Sport
  readonly template: WorkoutTemplate
  readonly reason: string
  readonly description: string
  readonly humanSteps: readonly string[]
}

export type PlannedDay = {
  readonly date: string
  readonly weekday: string
  readonly dayType: DayType
  readonly phase: Phase
  readonly recommended: Sport | 'REST'
  readonly options: readonly PlannedSession[]
  readonly notes: readonly string[]
  /** Strength belongs on a hard day, never the day before one. */
  readonly strength: StrengthSuggestion | null
}

export type Feasibility = {
  readonly goalId: string
  readonly verdict: 'on-track' | 'ambitious' | 'unrealistic'
  readonly message: string
}

export type Plan = {
  readonly generatedAt: string
  readonly state: TrainingState
  readonly history: readonly AdherenceDay[]
  readonly days: readonly PlannedDay[]
  readonly feasibility: readonly Feasibility[]
}
