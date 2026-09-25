import type { ExecutionTrace, SportThreshold, TracePoint } from './types.ts'

/**
 * The session over time, reduced to what a card can draw. intervals.icu sends one
 * sample per recorded second — an hour is 3600 of each stream — and a phone-wide
 * line needs a few hundred. Reduced on the server, so the payload stays small.
 */

/** Streams as intervals.icu sends them, one sample per recorded second. */
export type ActivityStreams = {
  readonly time: readonly (number | null)[]
  readonly watts: readonly (number | null)[] | null
  /** Metres per second. */
  readonly speed: readonly (number | null)[] | null
  readonly heartRate: readonly (number | null)[] | null
}

/** Enough points for a phone-wide line and a share image, few enough for the payload. */
const MAX_POINTS = 720
const MIN_STEP = 5
/** Power reads steady at ten seconds; GPS pace needs thirty before it stops jittering. */
const SMOOTHING_SECONDS = { power: 10, pace: 30 } as const

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

type Drawable = Exclude<SportThreshold, { readonly metric: 'swimPace' }>

/** Faster is higher for pace, as for watts: threshold pace over actual pace. */
const percentOf = (value: number, threshold: Drawable): number =>
  threshold.metric === 'power' ? (value / threshold.ftp) * 100 : (threshold.thresholdSecPerKm * value) / 10

const meanOf = (sums: readonly number[], counts: readonly number[]): readonly (number | null)[] =>
  sums.map((sum, index) => (counts[index]! > 0 ? sum / counts[index]! : null))

const averaged = (values: readonly (number | null)[], window: number): readonly (number | null)[] =>
  values.map((value, index) => {
    // A gap stays a gap: a paused recording is not an easy minute.
    if (value === null) return null
    const from = index - Math.floor((window - 1) / 2)
    const around = values.slice(Math.max(0, from), from + window).filter(isNumber)
    return around.reduce((sum, entry) => sum + entry, 0) / around.length
  })

export const buildTrace = (streams: ActivityStreams, threshold: SportThreshold): ExecutionTrace | null => {
  // A pool swim records lengths, not a speed over time; there is nothing honest to draw.
  if (threshold.metric === 'swimPace') return null
  const intensity = threshold.metric === 'power' ? streams.watts : streams.speed
  if (!intensity?.some(isNumber)) return null

  const last = streams.time.reduce<number>((top, time) => (isNumber(time) && time > top ? time : top), 0)
  if (last === 0) return null
  const step = Math.max(MIN_STEP, Math.ceil(last / MAX_POINTS / MIN_STEP) * MIN_STEP)

  // Summed in place: a five hour ride is 18 000 samples, and the Worker has milliseconds.
  const slots = Math.floor(last / step) + 1
  const sums = new Array<number>(slots).fill(0)
  const counts = new Array<number>(slots).fill(0)
  const beats = new Array<number>(slots).fill(0)
  const beatCounts = new Array<number>(slots).fill(0)
  streams.time.forEach((time, index) => {
    if (!isNumber(time)) return
    const slot = Math.floor(time / step)
    const value = intensity[index]
    const heart = streams.heartRate?.[index]
    if (isNumber(value)) {
      sums[slot]! += value
      counts[slot]! += 1
    }
    if (isNumber(heart) && heart > 0) {
      beats[slot]! += heart
      beatCounts[slot]! += 1
    }
  })

  const window = Math.max(1, Math.round(SMOOTHING_SECONDS[threshold.metric] / step))
  const values = averaged(meanOf(sums, counts), window)
  const hearts = meanOf(beats, beatCounts)

  const points: readonly TracePoint[] = values.map((value, index) => ({
    seconds: index * step,
    value: value === null ? null : Math.round(value * 100) / 100,
    percent: value === null ? null : Math.round(percentOf(value, threshold)),
    heartRate: hearts[index] == null ? null : Math.round(hearts[index]!),
  }))

  return { seconds: last, step, smoothing: window * step, points }
}

export type Span = { readonly from: number; readonly to: number }

/** The stretches of one interval spent inside its band — the part a card fills in. */
export const inTargetRuns = (
  trace: ExecutionTrace,
  span: Span,
  low: number,
  high: number,
): readonly Span[] =>
  trace.points
    .filter((point) => point.seconds + trace.step > span.from && point.seconds < span.to)
    .reduce<readonly Span[]>((runs, point) => {
      if (point.percent === null || point.percent < low || point.percent > high) return runs
      const from = Math.max(point.seconds, span.from)
      const to = Math.min(point.seconds + trace.step, span.to)
      const previous = runs[runs.length - 1]
      return previous && previous.to === from
        ? [...runs.slice(0, -1), { from: previous.from, to }]
        : [...runs, { from, to }]
    }, [])
