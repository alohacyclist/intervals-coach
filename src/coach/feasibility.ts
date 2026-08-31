import type { AthleteProfile, Feasibility, Goal } from './types.ts'
import { diffDays, formatSeconds } from './dates.ts'
import { racePaceSecPerKm } from './format.ts'

/** Realistic FTP gain for a trained athlete on two to three sessions per week. */
const FTP_PERCENT_PER_MONTH = 2.5
/** Realistic 10k improvement per month with adequate run frequency. */
const RACE_PERCENT_PER_MONTH = 0.8
const MIN_RUN_SESSIONS_FOR_10K = 3

const monthsUntil = (goal: Goal, today: string): number | null =>
  goal.targetDate ? Math.max(0.25, diffDays(today, goal.targetDate) / 30.44) : null

const ftpFeasibility = (goal: Goal, today: string): Feasibility => {
  const gainPercent = ((goal.targetValue - goal.currentValue) / goal.currentValue) * 100
  const months = monthsUntil(goal, today)

  if (months === null) {
    const estimated = Math.max(1, gainPercent / FTP_PERCENT_PER_MONTH)
    return {
      goalId: goal.id,
      verdict: 'on-track',
      message: `+${gainPercent.toFixed(1)}% FTP ohne Zieldatum — realistisch in ca. ${estimated.toFixed(0)} Monaten.`,
    }
  }

  const required = gainPercent / months
  const verdict =
    required <= FTP_PERCENT_PER_MONTH ? 'on-track' : required <= FTP_PERCENT_PER_MONTH * 2 ? 'ambitious' : 'unrealistic'
  const base = `${goal.currentValue}W → ${goal.targetValue}W in ${months.toFixed(1)} Monaten = ${required.toFixed(1)}%/Monat nötig (realistisch ~${FTP_PERCENT_PER_MONTH}%/Monat).`
  const advice =
    verdict === 'on-track'
      ? 'Machbar mit zwei Qualitätseinheiten pro Woche.'
      : verdict === 'ambitious'
        ? 'Möglich, wenn du drei Wochen am Stück belastest und die vierte reduzierst — Regeneration ist hier der Engpass.'
        : 'Zeitfenster verlängern oder Ziel senken; schneller geht es nur mit deutlich mehr Umfang.'
  return { goalId: goal.id, verdict, message: `${base} ${advice}` }
}

const raceFeasibility = (goal: Goal, profile: AthleteProfile, today: string): Feasibility => {
  const distanceKm = goal.distanceKm ?? 10
  const gainPercent = ((goal.currentValue - goal.targetValue) / goal.currentValue) * 100
  const months = monthsUntil(goal, today)
  const targetPace = racePaceSecPerKm(goal.targetValue, distanceKm)
  const currentPace = racePaceSecPerKm(goal.currentValue, distanceKm)
  const paceText = `${formatSeconds(currentPace)}/km → ${formatSeconds(targetPace)}/km`

  const volumeShortfall = distanceKm >= 10 && profile.weeklySessions.max < MIN_RUN_SESSIONS_FOR_10K + 1

  if (months === null) {
    return {
      goalId: goal.id,
      verdict: volumeShortfall ? 'ambitious' : 'on-track',
      message: `${paceText} (−${gainPercent.toFixed(1)}%) ohne Zieldatum. ${
        volumeShortfall
          ? `Für ${distanceKm}k brauchst du im Spezifik-Block mindestens ${MIN_RUN_SESSIONS_FOR_10K} Läufe/Woche.`
          : 'Frequenz passt.'
      }`,
    }
  }

  const required = gainPercent / months
  const timeVerdict =
    required <= RACE_PERCENT_PER_MONTH ? 'on-track' : required <= RACE_PERCENT_PER_MONTH * 2 ? 'ambitious' : 'unrealistic'
  const verdict = volumeShortfall && timeVerdict === 'on-track' ? 'ambitious' : timeVerdict
  const volumeNote = volumeShortfall
    ? ` Zeitlich reicht das Fenster, der Engpass ist die Laufhäufigkeit: in den letzten drei Monaten vor dem Ziel brauchst du ${MIN_RUN_SESSIONS_FOR_10K}+ Läufe/Woche statt der aktuell geplanten ${profile.weeklySessions.max} Einheiten insgesamt.`
    : ''
  return {
    goalId: goal.id,
    verdict,
    message: `${paceText} in ${months.toFixed(1)} Monaten = ${required.toFixed(2)}%/Monat nötig.${volumeNote}`,
  }
}

export const assessGoals = (
  goals: readonly Goal[],
  profile: AthleteProfile,
  today: string,
): readonly Feasibility[] =>
  goals.map((goal) =>
    goal.kind === 'ftp' ? ftpFeasibility(goal, today) : raceFeasibility(goal, profile, today),
  )
