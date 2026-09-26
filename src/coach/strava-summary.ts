import type { Execution, Sport } from './types.ts'

/**
 * What the app writes under a session on Strava. Strava takes no pictures from
 * outside apps, only text, so the drawing becomes a line of block characters —
 * the one chart a plain text field can hold.
 */

/** Marks the paragraph as this app's, so a second run replaces it instead of adding another. */
export const SIGNATURE = 'geplant und ausgewertet mit Formkurve'
/** Written before the app was named Formkurve; still this app's paragraph to replace. */
const EARLIER_SIGNATURES = ['geplant und ausgewertet mit intervals-coach']
const isOurs = (paragraph: string): boolean =>
  [SIGNATURE, ...EARLIER_SIGNATURES].some((signature) => paragraph.includes(signature))

const BLOCKS = '▁▂▃▄▅▆▇█'
/** Fits one line of the Strava app on a phone. */
const SPARK_WIDTH = 24
/** Easy riding sits at the bottom, the threshold near the top, anything harder at the top. */
const SPARK_FLOOR = 40
const SPARK_TOP = 115
const SYMBOL = { on: '✓', over: '↑', under: '↓' } as const

const clock = (seconds: number): string => {
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

/** The session as one line of block characters, averaged over equal slices of time. */
export const sparkline = (execution: Execution, width: number = SPARK_WIDTH): string | null => {
  const trace = execution.trace
  if (!trace || trace.seconds <= 0) return null
  const slices = Array.from({ length: width }, (_, index) => {
    const from = (index / width) * trace.seconds
    const to = ((index + 1) / width) * trace.seconds
    const inside = trace.points
      .filter((point) => point.seconds >= from && point.seconds < to && point.percent !== null)
      .map((point) => point.percent!)
    return inside.length === 0 ? null : inside.reduce((sum, value) => sum + value, 0) / inside.length
  })
  if (slices.every((slice) => slice === null)) return null
  return slices
    .map((slice) => {
      if (slice === null) return ' '
      const level = Math.round(((slice - SPARK_FLOOR) / (SPARK_TOP - SPARK_FLOOR)) * (BLOCKS.length - 1))
      return BLOCKS[Math.min(BLOCKS.length - 1, Math.max(0, level))]
    })
    .join('')
}

const isCompared = (execution: Execution): boolean =>
  execution.steps.length > 0 && execution.unavailable === null

export const summaryOf = (execution: Execution, appUrl: string | null): string => {
  const compared = isCompared(execution)
  const hit = execution.steps.filter((step) => step.verdict === 'on').length
  const verdicts = execution.steps.map((step) => (step.verdict ? SYMBOL[step.verdict] : '·')).join('')

  const headline = compared
    ? `${execution.templateName} · ${hit} von ${execution.steps.length} im Ziel ${verdicts}`
    : `${execution.templateName} · ${Math.round(execution.duration.actual / 60)} min`
  // No heart rate: Strava lets an athlete hide it per activity, and a description would show it anyway.
  const figures = [
    compared ? `Im Ziel ${clock(execution.inTargetSeconds)} von ${clock(execution.workPlannedSeconds)}` : null,
    `${execution.load.actual} TSS`,
  ].filter((part): part is string => part !== null)

  return [
    headline,
    sparkline(execution),
    figures.join(' · '),
    `— ${SIGNATURE}${appUrl ? ` · ${appUrl}` : ''}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

/**
 * The athlete's own words stay; only the paragraph this app wrote before is
 * replaced. Sending the same session twice therefore changes nothing.
 */
export const withSummary = (description: string | null, summary: string): string => {
  const own = (description ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !isOurs(paragraph))
  return [...own, summary].join('\n\n')
}

const STRAVA_SPORTS: Readonly<Record<string, Sport>> = {
  Ride: 'Ride',
  VirtualRide: 'Ride',
  GravelRide: 'Ride',
  MountainBikeRide: 'Ride',
  EBikeRide: 'Ride',
  EMountainBikeRide: 'Ride',
  Velomobile: 'Ride',
  Run: 'Run',
  TrailRun: 'Run',
  VirtualRun: 'Run',
  Swim: 'Swim',
}

export type StravaCandidate = { readonly id: string; readonly sportType: string; readonly startDate: string }

/** Two uploads of one recording start within seconds; ten minutes allows for a device clock that drifted. */
const MATCH_WINDOW_MS = 10 * 60 * 1000

/** The Strava activity that is the same session: same sport, closest start, within the window. */
export const findStravaMatch = (
  candidates: readonly StravaCandidate[],
  startedAt: string,
  sport: Sport,
): StravaCandidate | null => {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return null
  return (
    candidates
      .filter((candidate) => STRAVA_SPORTS[candidate.sportType] === sport)
      .map((candidate) => ({ candidate, distance: Math.abs(Date.parse(candidate.startDate) - start) }))
      .filter((entry) => entry.distance <= MATCH_WINDOW_MS)
      .sort((left, right) => left.distance - right.distance)[0]?.candidate ?? null
  )
}
