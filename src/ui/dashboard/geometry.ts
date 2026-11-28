import type { DashboardWeek, RideTrace } from '../../coach/dashboard.ts'
import type { MinuteBucket, SteadyBlock } from '../../coach/steady-block.ts'

const fixed = (value: number): string => value.toFixed(1)

export type WeekBar = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly partial: boolean
}

export type WeekChart = {
  readonly bars: readonly WeekBar[]
  /** Mean of the four weeks before, drawn through the bar centres. */
  readonly chronicPath: string
  readonly max: number
  readonly centres: readonly number[]
}

/** Load bars per week with the chronic mean as a line; both on one scale. */
export const weekChart = (weeks: readonly DashboardWeek[], width: number, height: number, pad = 6): WeekChart => {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.load, w.loadChronic ?? 0)))
  const slot = width / Math.max(1, weeks.length)
  const barWidth = Math.max(2, slot * 0.72)
  const scale = (value: number) => ((height - pad) * value) / max
  const centres = weeks.map((_w, i) => i * slot + slot / 2)
  const bars = weeks.map((w, i) => ({
    x: (centres[i] ?? 0) - barWidth / 2,
    y: height - scale(w.load),
    width: barWidth,
    height: scale(w.load),
    partial: w.partial,
  }))
  const points = weeks.flatMap((w, i) =>
    w.loadChronic === null ? [] : [`${fixed(centres[i] ?? 0)} ${fixed(height - scale(w.loadChronic))}`],
  )
  const chronicPath = points.map((p, i) => `${i ? 'L' : 'M'}${p}`).join(' ')
  return { bars, chronicPath, max, centres }
}

/** A line through the weeks with a value; a week without one breaks the line. */
export const seriesPath = (
  values: readonly (number | null)[],
  centres: readonly number[],
  height: number,
  pad = 6,
  /** A shared scale, so two lines in one chart can be compared; defaults to this line's own range. */
  range?: { readonly min: number; readonly max: number },
): { readonly path: string; readonly min: number; readonly max: number } => {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return { path: '', min: range?.min ?? 0, max: range?.max ?? 0 }
  const low = range?.min ?? Math.min(...known)
  const high = range?.max ?? Math.max(...known)
  const span = high - low || 0.1
  const y = (v: number) => pad + ((high - v) / span) * (height - 2 * pad)
  // A week alone between gaps gets a short dash: a bare move draws nothing and the value would vanish.
  const half = centres.length > 1 ? ((centres[1] ?? 0) - (centres[0] ?? 0)) / 6 : 4
  const path = values
    .map((v, i) => {
      if (v === null) return ''
      const x = centres[i] ?? 0
      const joined = i > 0 && values[i - 1] != null
      const alone = !joined && values[i + 1] == null
      if (alone) return `M${fixed(x - half)} ${fixed(y(v))} L${fixed(x + half)} ${fixed(y(v))}`
      return `${joined ? 'L' : 'M'}${fixed(x)} ${fixed(y(v))}`
    })
    .filter(Boolean)
    .join(' ')
  return { path, min: low, max: high }
}

export const TRACE_WIDTH = 1000
export const TRACE_HEIGHT = 130

export type TraceGeometry = {
  readonly powerPath: string
  readonly hrPath: string
  readonly powerMax: number
  readonly hrMin: number
  readonly hrMax: number
  readonly lastMinute: number
  readonly x: (minute: number) => number
  readonly yPower: (watts: number) => number
  readonly yHeart: (bpm: number) => number
}

const roundUp = (value: number, step: number): number => Math.ceil(value / step) * step
const roundDown = (value: number, step: number): number => Math.floor(value / step) * step

/** A line through the minutes; a missing minute breaks it instead of bridging the pause. */
const minutePath = (
  minutes: readonly MinuteBucket[],
  x: (minute: number) => number,
  y: (m: MinuteBucket) => number,
): string =>
  minutes
    .map((m, i) => {
      const joined = i > 0 && minutes[i - 1]?.minute === m.minute - 1
      return `${joined ? 'L' : 'M'}${fixed(x(m.minute))} ${fixed(y(m))}`
    })
    .join(' ')

/** Power and heart rate on the minute axis; a pause breaks both lines instead of bridging it. */
export const traceGeometry = (trace: RideTrace): TraceGeometry => {
  const minutes = trace.minutes
  const lastMinute = Math.max(1, minutes[minutes.length - 1]?.minute ?? 1)
  const powerMax = Math.max(100, roundUp(Math.max(...minutes.map((m) => m.watts), 0), 50))
  const hrMin = roundDown(Math.min(...minutes.map((m) => m.heartRate), 200), 10)
  const hrMax = Math.max(hrMin + 20, roundUp(Math.max(...minutes.map((m) => m.heartRate), 0), 10))
  const inner = TRACE_HEIGHT - 10
  const x = (minute: number) => (minute / lastMinute) * TRACE_WIDTH
  const yPower = (watts: number) => 5 + inner - (Math.min(watts, powerMax) / powerMax) * inner
  const yHeart = (bpm: number) => 5 + inner - ((Math.min(Math.max(bpm, hrMin), hrMax) - hrMin) / (hrMax - hrMin)) * inner
  return {
    powerPath: minutePath(minutes, x, (m) => yPower(m.watts)),
    hrPath: minutePath(minutes, x, (m) => yHeart(m.heartRate)),
    powerMax,
    hrMin,
    hrMax,
    lastMinute,
    x,
    yPower,
    yHeart,
  }
}

/** Start, middle and end of the steady block as minutes on the trace axis. */
export const blockMinutes = (block: SteadyBlock): { readonly start: number; readonly mid: number; readonly end: number } => ({
  start: block.startS / 60,
  mid: (block.startS + block.durationS / 2) / 60,
  end: (block.startS + block.durationS) / 60,
})

export const inBlock = (minute: number, block: SteadyBlock): boolean =>
  minute * 60 >= block.startS && minute * 60 < block.startS + block.durationS

export type RatioGeometry = {
  readonly path: string
  readonly min: number
  readonly max: number
  readonly y: (ratio: number) => number
}

/**
 * Heart rate per watt, the number both rules compare, inside the steady block
 * only: outside it the rules say nothing. `marks` are values the scale must
 * hold as well, such as the half means and the baseline.
 */
export const ratioGeometry = (
  trace: RideTrace,
  x: (minute: number) => number,
  marks: readonly number[],
): RatioGeometry | null => {
  const block = trace.block
  if (!block) return null
  const inside = trace.minutes.filter((m) => m.watts > 0 && inBlock(m.minute, block))
  if (inside.length < 2) return null
  const values = [...inside.map((m) => m.heartRate / m.watts), ...marks]
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = (high - low || 0.05) * 0.15
  const min = low - pad
  const max = high + pad
  const inner = TRACE_HEIGHT - 10
  const y = (ratio: number) => 5 + inner - ((Math.min(Math.max(ratio, min), max) - min) / (max - min)) * inner
  return { path: minutePath(inside, x, (m) => y(m.heartRate / m.watts)), min, max, y }
}

/** Minute marks for the time axis: every 10, 15 or 30 minutes, by ride length. */
export const timeTicks = (lastMinute: number): readonly number[] => {
  const step = lastMinute <= 60 ? 10 : lastMinute <= 150 ? 15 : 30
  return Array.from({ length: Math.floor(lastMinute / step) + 1 }, (_unused, i) => i * step)
}

/** Minor marks on the slider: every minute, every five on long rides so they stay apart. */
export const minorStep = (lastMinute: number): number => (lastMinute <= 120 ? 1 : 5)

/** The bucket closest to a minute on the slider; a paused minute falls to its neighbour. */
export const nearestBucket = (minutes: readonly MinuteBucket[], minute: number): MinuteBucket | null =>
  minutes.reduce<MinuteBucket | null>(
    (best, m) => (best === null || Math.abs(m.minute - minute) < Math.abs(best.minute - minute) ? m : best),
    null,
  )
