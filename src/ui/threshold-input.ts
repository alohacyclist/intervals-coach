import type { Sport, SportSetting, SportThreshold } from '../coach/types.ts'
import { defaultThreshold } from '../coach/thresholds.ts'
import type { SportSettings } from './api.ts'
import { formatSeconds, parseTime } from './format-input.ts'

/**
 * Where a threshold in the form came from. A value nobody chose must never pass
 * for the athlete's own: 250 W left standing silently sets every target wrong.
 */
export type ThresholdSource = 'intervals' | 'estimate' | 'own'

export type ThresholdSources = Partial<Readonly<Record<Sport, ThresholdSource>>>

export const SOURCE_NOTES: Readonly<Record<Exclude<ThresholdSource, 'own'>, string>> = {
  intervals: 'aus intervals.icu übernommen',
  estimate: 'Schätzwert – bitte prüfen',
}

export const thresholdText = (threshold: SportThreshold): string => {
  if (threshold.metric === 'power') return String(threshold.ftp)
  if (threshold.metric === 'pace') return formatSeconds(threshold.thresholdSecPerKm)
  return formatSeconds(threshold.cssSecPer100m)
}

export const thresholdFromText = (sport: Sport, value: string): SportThreshold | null => {
  if (sport === 'Ride') {
    const ftp = Number(value.trim())
    return value.trim() !== '' && Number.isFinite(ftp) && ftp > 0 ? { metric: 'power', ftp: Math.round(ftp) } : null
  }
  const seconds = parseTime(value)
  if (seconds === null) return null
  return sport === 'Run'
    ? { metric: 'pace', thresholdSecPerKm: seconds }
    : { metric: 'swimPace', cssSecPer100m: seconds }
}

/** Text typed into a field, and the threshold it was typed over. */
export type ThresholdEdit = { readonly text: string; readonly basis: SportThreshold }

/**
 * What the field shows. Typing is kept only while the threshold underneath is
 * still the one it was typed over; once something else replaced the value — a
 * prefill from intervals.icu arriving late — the field shows that instead of
 * holding on to the default it was first drawn with.
 */
export const shownText = (edit: ThresholdEdit | undefined, threshold: SportThreshold): string =>
  edit !== undefined && edit.basis === threshold ? edit.text : thresholdText(threshold)

const fromIntervals = (sport: Sport, settings: SportSettings | null): SportThreshold | null => {
  if (settings === null) return null
  if (sport === 'Ride' && settings.ftp) return { metric: 'power', ftp: settings.ftp }
  if (sport === 'Run' && settings.thresholdPaceSecPerKm) {
    return { metric: 'pace', thresholdSecPerKm: settings.thresholdPaceSecPerKm }
  }
  if (sport === 'Swim' && settings.cssSecPer100m) {
    return { metric: 'swimPace', cssSecPer100m: settings.cssSecPer100m }
  }
  return null
}

export type Prefilled = { readonly threshold: SportThreshold; readonly source: ThresholdSource }

/** The athlete's own intervals.icu value where there is one, a marked estimate where not. */
export const prefilledThreshold = (sport: Sport, settings: SportSettings | null): Prefilled => {
  const known = fromIntervals(sport, settings)
  return known === null
    ? { threshold: defaultThreshold(sport), source: 'estimate' }
    : { threshold: known, source: 'intervals' }
}

/** Fills every sport the athlete has not typed a value for; their own values stay. */
export const prefillSports = (
  sports: readonly SportSetting[],
  sources: ThresholdSources,
  settings: SportSettings | null,
): { readonly sports: readonly SportSetting[]; readonly sources: ThresholdSources } => {
  const filled = sports.map((setting) => {
    if (sources[setting.sport] === 'own') return { setting, source: 'own' as const }
    const { threshold, source } = prefilledThreshold(setting.sport, settings)
    return { setting: { ...setting, threshold }, source }
  })
  return {
    sports: filled.map((entry) => entry.setting),
    sources: Object.fromEntries(filled.map((entry) => [entry.setting.sport, entry.source])),
  }
}
