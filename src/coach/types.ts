export type Sport = 'Ride' | 'Run'

export const SPORTS: readonly Sport[] = ['Ride', 'Run'] as const

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

export type AthleteProfile = {
  readonly ftp: number
  /** Threshold pace in seconds per km, must match the value set in intervals.icu. */
  readonly thresholdPaceSecPerKm: number
  readonly weightKg: number
  readonly maxHr: number | null
  readonly lthr: number | null
  /** Sessions the athlete can realistically complete per week. */
  readonly weeklySessions: number
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
  readonly date: string
  readonly sport: Sport | 'Other'
  readonly name: string
  readonly load: number
  readonly intensity: number
  readonly movingTimeSec: number
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
  readonly hardThisWeekBySport: Readonly<Record<Sport, number>>
  readonly recentWorkoutNames: readonly string[]
  readonly loadLast7: number
  /** CTL change over the last 7 days. */
  readonly rampRate: number
  readonly readiness: Readiness
  readonly recency: readonly StimulusRecency[]
  /** The newest activity the plan was built from — makes stale data visible. */
  readonly lastActivity: RecentActivity | null
  readonly activityCount: number
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
}

export type Feasibility = {
  readonly goalId: string
  readonly verdict: 'on-track' | 'ambitious' | 'unrealistic'
  readonly message: string
}

export type Plan = {
  readonly generatedAt: string
  readonly state: TrainingState
  readonly days: readonly PlannedDay[]
  readonly feasibility: readonly Feasibility[]
}
