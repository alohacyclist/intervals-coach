import type { AthleteProfile, Sport, SportThreshold, ThresholdSuggestion } from './types.ts'
import { formatSeconds } from './dates.ts'

/** Below this the difference is noise, not drift. */
const REPORT_THRESHOLD_PERCENT = 3

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
  sport: Sport,
  metric: SportThreshold['metric'],
  configured: number,
  observed: number,
  drift: number,
): string => {
  const render = (value: number) =>
    metric === 'power'
      ? `${Math.round(value)} W`
      : `${formatSeconds(value)}${metric === 'swimPace' ? '/100m' : '/km'}`
  const direction = drift > 0 ? 'besser' : 'schwächer'
  const consequence =
    drift > 0
      ? 'Deine Vorgaben sind dadurch zu leicht — der Reiz fällt kleiner aus als geplant.'
      : 'Deine Vorgaben sind dadurch zu hart — was als Schwelle geplant ist, liegt faktisch darüber.'
  return `intervals.icu misst ${render(observed)}, eingestellt sind ${render(configured)} — ${Math.abs(drift).toFixed(1)} % ${direction}. ${consequence}`
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
    if (Math.abs(drift) < REPORT_THRESHOLD_PERCENT) return []
    return [
      {
        sport: setting.sport,
        metric: setting.threshold.metric,
        configured,
        observed: measured,
        driftPercent: Math.round(drift * 10) / 10,
        message: describe(setting.sport, setting.threshold.metric, configured, measured, drift),
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
