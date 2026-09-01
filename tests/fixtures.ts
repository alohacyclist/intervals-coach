import type { Activity, CoachConfig, Sport, Wellness } from '../src/coach/types.ts'
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
  ...overrides,
})

export const wellness = (daysAgo: number, overrides: Partial<Wellness> = {}): Wellness => ({
  date: addDays(TODAY, -daysAgo),
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
      label: '10km sub 36',
      targetValue: 2160,
      currentValue: 2280,
      distanceKm: 10,
      targetDate: '2027-05-31',
      priority: 'A',
    },
  ],
  planStart: '2026-08-31',
}
