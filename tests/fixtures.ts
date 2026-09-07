import type {
  Activity,
  CoachConfig,
  PlannedEvent,
  Sport,
  SportThreshold,
  Wellness,
} from '../src/coach/types.ts'
import { addDays } from '../src/coach/dates.ts'

// A Wednesday, so the current calendar week already contains earlier days.
export const TODAY = '2026-09-02'

export const activity = (
  daysAgo: number,
  sport: Sport,
  overrides: Partial<Activity> = {},
): Activity => ({
  id: `a-${daysAgo}-${sport}`,
  source: 'GARMIN',
  date: addDays(TODAY, -daysAgo),
  sport,
  name: `${sport} ${daysAgo}`,
  load: 60,
  intensity: 80,
  movingTimeSec: 3600,
  isStrength: false,
  pairedEventId: null,
  compliance: null,
  averageHr: null,
  zoneSeconds: {},
  ...overrides,
})

export const wellness = (daysAgo: number, overrides: Partial<Wellness> = {}): Wellness => ({
  date: addDays(TODAY, -daysAgo),
  eftpBySport: {},
  hrv: 70,
  restingHr: 45,
  sleepSecs: 7 * 3600,
  fatigue: 1,
  soreness: 1,
  ...overrides,
})

export const baselineWellness = (days = 30): readonly Wellness[] =>
  Array.from({ length: days }, (_unused, index) => wellness(index + 1))

export const config: CoachConfig = {
  profile: {
    equipment: 'dumbbells',
    sports: [
      { sport: 'Ride', threshold: { metric: 'power', ftp: 280 } },
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
      currentValue: 280,
      targetDate: '2026-11-30',
      priority: 'A',
    },
    {
      id: '10k-sub36',
      sport: 'Run',
      kind: 'raceTime',
      label: '10km sub 36',
      targetValue: 2160,
      currentValue: 2280,
      distanceKm: 10,
      targetDate: '2027-05-31',
      priority: 'A',
    },
  ],
  strengthLog: [],
  breaks: [],
  planStart: '2026-08-31',
}

export const BIKE_THRESHOLD: SportThreshold = { metric: 'power', ftp: 280 }
export const RUN_THRESHOLD: SportThreshold = { metric: 'pace', thresholdSecPerKm: 236 }
export const SWIM_THRESHOLD: SportThreshold = { metric: 'swimPace', cssSecPer100m: 110 }

/** A triathlete: all three sports, each with its own steering quantity. */
export const triConfig: CoachConfig = {
  ...config,
  profile: {
    ...config.profile,
    sports: [
      { sport: 'Ride', threshold: BIKE_THRESHOLD },
      { sport: 'Run', threshold: RUN_THRESHOLD },
      { sport: 'Swim', threshold: SWIM_THRESHOLD },
    ],
  },
}

export const plannedEvent = (
  daysAgo: number,
  name: string,
  overrides: Partial<PlannedEvent> = {},
): PlannedEvent => ({
  id: `e-${daysAgo}-${name}`,
  date: addDays(TODAY, -daysAgo),
  name,
  sport: 'Ride',
  externalId: `coach:${addDays(TODAY, -daysAgo)}:tpl`,
  pairedActivityId: null,
  ...overrides,
})
