import type { AthleteProfile, Sport, SportThreshold, ThresholdSuggestion } from './types.ts'
import { formatSeconds } from './dates.ts'

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
