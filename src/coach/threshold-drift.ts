import type { AthleteProfile, Sport, SportThreshold, ThresholdSuggestion } from './types.ts'
import { formatSeconds } from './dates.ts'
import type { WorkReading } from './efficiency.ts'
import { thresholdImplied } from './efficiency.ts'

/** Below this the difference is noise, not drift. */
const REPORT_THRESHOLD_PERCENT = 3
/**
 * A drop has to be larger before it is worth mentioning: the estimate is bounded
 * by what the athlete has attempted, so it falls whenever hard efforts are
 * missing — which looks exactly like a loss of form but is not one.
 */
const REPORT_DROP_PERCENT = 6

/** What intervals.icu currently observes, in each sport's own unit. */
export type ObservedThresholds = Partial<Record<Sport, number>>

const valueOf = (threshold: SportThreshold): number => {
  if (threshold.metric === 'power') return threshold.ftp
  if (threshold.metric === 'pace') return threshold.thresholdSecPerKm
  return threshold.cssSecPer100m
}

/** Power rises when you improve; pace falls. Both are reported as a gain. */
const improvementPercent = (metric: SportThreshold['metric'], configured: number, observed: number): number => {
  const raw = ((observed - configured) / configured) * 100
  return metric === 'power' ? raw : -raw
}

const describe = (
  metric: SportThreshold['metric'],
  configured: number,
  observed: number,
  drift: number,
): string => {
  const render = (value: number) =>
    metric === 'power'
      ? `${Math.round(value)} W`
      : `${formatSeconds(value)}${metric === 'swimPace' ? '/100m' : '/km'}`
  const measured = `intervals.icu misst ${render(observed)}, eingestellt sind ${render(configured)} — ${Math.abs(drift).toFixed(1)} %`

  return drift > 0
    ? `${measured} besser. Diese Leistung hast du nachweislich erbracht, deine Vorgaben sind also zu leicht geworden.`
    : `${measured} schwächer. Der Schätzwert kann aber nur abbilden, was du versucht hast — fehlen maximale Belastungen, sinkt er von selbst. Bestätige ihn mit der Standortbestimmung, bevor du den Wert senkst.`
}

/**
 * Compares the thresholds the plan calculates with against what intervals.icu
 * derives from actual training. Every watt and pace target hangs off these.
 */
export const thresholdSuggestions = (
  profile: AthleteProfile,
  observed: ObservedThresholds,
): readonly ThresholdSuggestion[] =>
  profile.sports.flatMap((setting) => {
    const measured = observed[setting.sport]
    if (measured === undefined || measured <= 0) return []
    const configured = valueOf(setting.threshold)
    const drift = improvementPercent(setting.threshold.metric, configured, measured)
    const limit = drift > 0 ? REPORT_THRESHOLD_PERCENT : REPORT_DROP_PERCENT
    if (Math.abs(drift) < limit) return []
    return [
      {
        sport: setting.sport,
        metric: setting.threshold.metric,
        configured,
        observed: measured,
        driftPercent: Math.round(drift * 10) / 10,
        action: drift > 0 ? 'adopt' : 'verify',
        message: describe(setting.threshold.metric, configured, measured, drift),
      },
    ]
  })

/**
 * A suggestion the athlete measured rather than one a model inferred. It always
 * says adopt: a completed maximal effort is evidence, not a guess that fell
 * because hard efforts were missing.
 */
export const measuredSuggestion = (
  profile: AthleteProfile,
  sport: Sport,
  value: number,
): ThresholdSuggestion | null => {
  const setting = profile.sports.find((entry) => entry.sport === sport)
  if (!setting || value <= 0) return null
  const configured = valueOf(setting.threshold)
  // Adopting rounds, so an adopted measurement matches only after rounding too.
  if (Math.round(value) === Math.round(configured)) return null
  const drift = improvementPercent(setting.threshold.metric, configured, value)
  const render = (amount: number) =>
    setting.threshold.metric === 'power'
      ? `${Math.round(amount)} W`
      : `${formatSeconds(amount)}${setting.threshold.metric === 'swimPace' ? '/100m' : '/km'}`

  return {
    sport,
    metric: setting.threshold.metric,
    configured,
    observed: value,
    driftPercent: Math.round(drift * 10) / 10,
    action: 'adopt',
    message:
      `Aus deiner Standortbestimmung: ${render(value)} statt ${render(configured)}. ` +
      'Das ist gemessen, nicht geschätzt — alle Vorgaben sollten jetzt darauf stehen.',
  }
}

/** Points of threshold outside the band, on average, before two sessions say the targets are off. */
export const EXECUTION_DRIFT_POINTS = 3

/** A compared interval session, newest first where a list is passed. */
export type ReadSession = { readonly date: string; readonly reading: WorkReading }

/**
 * The targets set from the threshold, held against what the athlete actually
 * did. Two interval sessions in a row that sat well above their bands mean the
 * threshold is behind; two well below are a reason to check it, not to lower
 * it — tired legs look the same.
 */
export const executionSuggestion = (
  profile: AthleteProfile,
  sport: Sport,
  sessions: readonly ReadSession[],
): ThresholdSuggestion | null => {
  const setting = profile.sports.find((entry) => entry.sport === sport)
  const [latest, before] = sessions
  if (!setting || !latest || !before) return null
  const deviations = [latest.reading.deviation, before.reading.deviation]
  const above = deviations.every((deviation) => deviation >= EXECUTION_DRIFT_POINTS)
  const below = deviations.every((deviation) => deviation <= -EXECUTION_DRIFT_POINTS)
  if (!above && !below) return null

  const configured = valueOf(setting.threshold)
  const implied = thresholdImplied(setting.threshold.metric, configured, [latest.reading, before.reading])
  if (implied === null || Math.round(implied) === Math.round(configured)) return null
  const drift = improvementPercent(setting.threshold.metric, configured, implied)
  const render = (amount: number) =>
    setting.threshold.metric === 'power'
      ? `${Math.round(amount)} W`
      : `${formatSeconds(amount)}${setting.threshold.metric === 'swimPace' ? '/100m' : '/km'}`
  const average = Math.abs((deviations[0]! + deviations[1]!) / 2).toLocaleString('de-DE', { maximumFractionDigits: 1 })
  const dates = [before.date, latest.date].map((date) => `${date.slice(8, 10)}.${date.slice(5, 7)}.`).join(' und ')

  return {
    sport,
    metric: setting.threshold.metric,
    configured,
    observed: implied,
    driftPercent: Math.round(drift * 10) / 10,
    action: above ? 'adopt' : 'verify',
    message: above
      ? `Deine Intervalle am ${dates} lagen im Schnitt ${average} Punkte über dem Zielbereich. ` +
        `Das passt zu einer Schwelle von ${render(implied)} statt ${render(configured)} — die Vorgaben sind zu leicht geworden.`
      : `Deine Intervalle am ${dates} lagen im Schnitt ${average} Punkte unter dem Zielbereich. ` +
        `Rechnerisch wären das ${render(implied)} statt ${render(configured)}. Müde Beine sehen genauso aus — bestätige es mit der Standortbestimmung, bevor du den Wert senkst.`,
  }
}

/** Applies a suggestion, leaving every other sport untouched. */
export const adoptThreshold = (
  profile: AthleteProfile,
  sport: Sport,
  observed: number,
): AthleteProfile => ({
  ...profile,
  sports: profile.sports.map((setting) => {
    if (setting.sport !== sport) return setting
    const rounded = Math.round(observed)
    if (setting.threshold.metric === 'power') return { ...setting, threshold: { metric: 'power', ftp: rounded } }
    if (setting.threshold.metric === 'pace') {
      return { ...setting, threshold: { metric: 'pace', thresholdSecPerKm: rounded } }
    }
    return { ...setting, threshold: { metric: 'swimPace', cssSecPer100m: rounded } }
  }),
})
