import type { AthleteProfile, Feasibility, Goal, Sport } from './types.ts'
import { diffDays, formatSeconds } from './dates.ts'
import { racePaceSecPer100m, racePaceSecPerKm } from './format.ts'
import { ftpOf, thresholdFor } from './thresholds.ts'

/** Realistic FTP gain for a trained athlete on two to three sessions per week. */
const FTP_PERCENT_PER_MONTH = 2.5
/** Realistic 10k improvement per month with adequate run frequency. */
const RACE_PERCENT_PER_MONTH = 0.8
const MIN_RUN_SESSIONS_FOR_10K = 3
const WEEKS_PER_MONTH = 4.345
/** Riegel's exponent: how a race time grows with distance. */
const RIEGEL = 1.06

const number = (value: number, digits = 1): string =>
  value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Weeks from today to the goal date — half a week at the very least, so the maths holds. */
const weeksUntil = (goal: Goal, today: string): number | null =>
  goal.targetDate ? Math.max(0.5, diffDays(today, goal.targetDate) / 7) : null

/**
 * Threshold pace is roughly what an athlete holds for an hour, so every other
 * distance follows from it. That keeps the goal measured against what the plan
 * currently believes, instead of against a number typed in months ago.
 */
const projectedTime = (thresholdSecPerKm: number, distanceKm: number): number =>
  Math.round(3600 * (distanceKm / (3600 / thresholdSecPerKm)) ** RIEGEL)

const currentTime = (goal: Goal, profile: AthleteProfile): number | null => {
  const threshold = thresholdFor(profile, goal.sport as Sport)
  const distanceKm = goal.distanceKm ?? 10
  if (threshold?.metric === 'pace') return projectedTime(threshold.thresholdSecPerKm, distanceKm)
  if (threshold?.metric === 'swimPace')
    return projectedTime(threshold.cssSecPer100m * 10, distanceKm)
  return null
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
  const distanceKm = goal.distanceKm ?? 10
  const projected = currentTime(goal, profile)
  const current = projected ?? goal.currentValue
  const perHundred = goal.sport === 'Swim'
  const unit = perHundred ? '/100m' : '/km'
  const pace = (seconds: number) =>
    formatSeconds(
      perHundred ? racePaceSecPer100m(seconds, distanceKm) : racePaceSecPerKm(seconds, distanceKm),
    )
  const source = projected === null ? 'eingetragen' : 'aus deiner Schwellenpace hochgerechnet'
  const times = `Jetzt ${formatSeconds(current)} → ${formatSeconds(goal.targetValue)} auf ${distanceKm} km (${pace(current)}${unit} → ${pace(goal.targetValue)}${unit}, ${source})`

  const volumeShortfall =
    goal.sport === 'Run' &&
    distanceKm >= 10 &&
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
