import type { AthleteProfile, Feasibility, Goal, Sport } from './types.ts'
import { diffDays, formatClock, formatSeconds } from './dates.ts'
import { formatDistance, racePaceSecPer100m, racePaceSecPerKm } from './format.ts'
import { ftpOf, thresholdFor } from './thresholds.ts'

/** Realistic FTP gain for a trained athlete on two to three sessions per week. */
const FTP_PERCENT_PER_MONTH = 2.5
/** Realistic 10k improvement per month with adequate run frequency. */
const RACE_PERCENT_PER_MONTH = 0.8
const MIN_RUN_SESSIONS_FOR_10K = 3
const WEEKS_PER_MONTH = 4.345
/**
 * How long each threshold is held all out. Run threshold pace is roughly the
 * hour; critical swim speed roughly thirty minutes, as the library says too.
 * Treating CSS as an hour's pace made every swim distance come out too fast.
 */
const ANCHOR_SECONDS: Readonly<Partial<Record<Sport, number>>> = { Run: 3600, Swim: 1800 }
/**
 * Riegel's exponent: how a race time grows with distance. Swimming slows less
 * with distance than running; with 1.03 a 400 m comes out a few seconds per
 * 100 m faster than CSS and 1500 m close to it, which is what CSS tests show.
 */
const RIEGEL: Readonly<Partial<Record<Sport, number>>> = { Run: 1.06, Swim: 1.03 }

const number = (value: number, digits = 1): string =>
  value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Weeks from today to the goal date — half a week at the very least, so the maths holds. */
const weeksUntil = (goal: Goal, today: string): number | null =>
  goal.targetDate ? Math.max(0.5, diffDays(today, goal.targetDate) / 7) : null

const secondsPerKm = (profile: AthleteProfile, sport: Sport): number | null => {
  const threshold = thresholdFor(profile, sport)
  if (threshold?.metric === 'pace') return threshold.thresholdSecPerKm
  if (threshold?.metric === 'swimPace') return threshold.cssSecPer100m * 10
  return null
}

/**
 * The race time the current threshold predicts, so every distance follows from
 * the one pace the plan already believes, instead of a number typed in months
 * ago. Null where the sport has no pace to project from, or nothing to project to.
 */
export const projectedRaceTime = (
  profile: AthleteProfile,
  sport: Sport,
  distanceKm: number | undefined,
): number | null => {
  const pace = secondsPerKm(profile, sport)
  const anchor = ANCHOR_SECONDS[sport]
  const exponent = RIEGEL[sport]
  if (pace === null || anchor === undefined || exponent === undefined) return null
  if (distanceKm === undefined || !(distanceKm > 0)) return null
  return Math.round(anchor * (distanceKm / (anchor / pace)) ** exponent)
}

const reached = (goal: Goal, current: number, text: string): Feasibility => ({
  goalId: goal.id,
  verdict: 'on-track',
  currentValue: current,
  weeksLeft: null,
  message: text,
})

const ftpFeasibility = (goal: Goal, profile: AthleteProfile, today: string): Feasibility => {
  const current = ftpOf(profile) ?? goal.currentValue
  const weeks = weeksUntil(goal, today)
  const missing = goal.targetValue - current

  if (missing <= 0) {
    return reached(
      goal,
      current,
      `Ziel erreicht: jetzt ${current} W, angepeilt waren ${goal.targetValue} W.`,
    )
  }

  const gainPercent = (missing / current) * 100
  if (weeks === null) {
    const months = Math.max(0.5, gainPercent / FTP_PERCENT_PER_MONTH)
    return {
      goalId: goal.id,
      verdict: 'on-track',
      currentValue: current,
      weeksLeft: null,
      message: `Jetzt ${current} W → ${goal.targetValue} W, kein Zieldatum. Bei realistischen ${number(FTP_PERCENT_PER_MONTH)} %/Monat sind das rund ${number(months)} Monate.`,
    }
  }

  const perWeek = missing / weeks
  const realistic = (current * FTP_PERCENT_PER_MONTH) / 100 / WEEKS_PER_MONTH
  const verdict =
    perWeek <= realistic ? 'on-track' : perWeek <= realistic * 2 ? 'ambitious' : 'unrealistic'
  const advice =
    verdict === 'on-track'
      ? 'Machbar mit zwei Qualitätseinheiten pro Woche.'
      : verdict === 'ambitious'
        ? 'Möglich, wenn du drei Wochen am Stück belastest und die vierte reduzierst — Regeneration ist hier der Engpass.'
        : 'Zeitfenster verlängern oder Ziel senken; schneller geht es nur mit deutlich mehr Umfang.'

  return {
    goalId: goal.id,
    verdict,
    currentValue: current,
    weeksLeft: weeks,
    message: `Jetzt ${current} W → ${goal.targetValue} W in ${number(weeks)} Wochen = +${number(perWeek)} W/Woche nötig (realistisch ~${number(realistic)} W/Woche). ${advice}`,
  }
}

const raceFeasibility = (goal: Goal, profile: AthleteProfile, today: string): Feasibility => {
  // No distance, no projection: a guessed 10 km would be absurd for a swim and wrong for a marathon.
  const distanceKm = goal.distanceKm
  const projected = projectedRaceTime(profile, goal.sport, distanceKm)
  const current = projected ?? goal.currentValue
  const perHundred = goal.sport === 'Swim'
  const unit = perHundred ? '/100m' : '/km'
  const pace = (seconds: number, km: number) =>
    formatSeconds(perHundred ? racePaceSecPer100m(seconds, km) : racePaceSecPerKm(seconds, km))
  const source =
    projected === null
      ? 'eingetragen'
      : perHundred
        ? 'aus deiner CSS hochgerechnet'
        : 'aus deiner Schwellenpace hochgerechnet'
  const where =
    distanceKm === undefined
      ? ` (${source}, ohne Distanz keine Hochrechnung)`
      : ` auf ${formatDistance(goal.sport, distanceKm)} (${pace(current, distanceKm)}${unit} → ${pace(goal.targetValue, distanceKm)}${unit}, ${source})`
  const times = `Jetzt ${formatClock(current)} → ${formatClock(goal.targetValue)}${where}`

  const volumeShortfall =
    goal.sport === 'Run' &&
    (distanceKm ?? 0) >= 10 &&
    profile.weeklySessions.max < MIN_RUN_SESSIONS_FOR_10K + 1
  const volumeNote = volumeShortfall
    ? ` Der Engpass ist die Laufhäufigkeit: in den letzten drei Monaten vor dem Ziel brauchst du ${MIN_RUN_SESSIONS_FOR_10K}+ Läufe/Woche statt der aktuell geplanten ${profile.weeklySessions.max} Einheiten insgesamt.`
    : ''

  if (current <= goal.targetValue) {
    return reached(
      goal,
      current,
      `${times} — die Zielzeit liegt bereits im Bereich deiner aktuellen Form.${volumeNote}`,
    )
  }

  const weeks = weeksUntil(goal, today)
  if (weeks === null) {
    return {
      goalId: goal.id,
      verdict: volumeShortfall ? 'ambitious' : 'on-track',
      currentValue: current,
      weeksLeft: null,
      message: `${times}, kein Zieldatum.${volumeNote}`,
    }
  }

  const perWeek = (current - goal.targetValue) / weeks
  const realistic = (current * RACE_PERCENT_PER_MONTH) / 100 / WEEKS_PER_MONTH
  const timeVerdict =
    perWeek <= realistic ? 'on-track' : perWeek <= realistic * 2 ? 'ambitious' : 'unrealistic'

  return {
    goalId: goal.id,
    verdict: volumeShortfall && timeVerdict === 'on-track' ? 'ambitious' : timeVerdict,
    currentValue: current,
    weeksLeft: weeks,
    message: `${times} in ${number(weeks)} Wochen = ${number(perWeek, 0)} s/Woche nötig (realistisch ~${number(realistic, 0)} s/Woche).${volumeNote}`,
  }
}

export const assessGoals = (
  goals: readonly Goal[],
  profile: AthleteProfile,
  today: string,
): readonly Feasibility[] =>
  goals.map((goal) =>
    goal.kind === 'ftp'
      ? ftpFeasibility(goal, profile, today)
      : raceFeasibility(goal, profile, today),
  )
