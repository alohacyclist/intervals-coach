import type { ExecutedStep, Execution, ExecutionTrace, SportThreshold } from '../coach/types.ts'
import type { Span } from '../coach/trace.ts'
import { inTargetRuns } from '../coach/trace.ts'

/**
 * The drawing of a session over time, apart from any surface: the card draws it
 * as SVG, the share image on a canvas, and both have to show the same thing.
 * Positions are fractions from 0 to 1 — the surface scales them.
 */

/** Room above the highest target, so a VO2 band never touches the top edge. */
const HEADROOM = 15
const FLOOR_CEILING = 140

export const SYMBOL = { on: '✓', over: '↑', under: '↓' } as const

/**
 * A line needs no zero: starting at 30 % gives a ten-point band twice the
 * height, and a stop still reads as a drop to the floor.
 */
export const FLOOR_PERCENT = 30

/** Height of a share of threshold as a fraction of the drawing, floor to ceiling. */
export const heightOf = (percent: number, ceiling: number): number =>
  (Math.min(ceiling, Math.max(FLOOR_PERCENT, percent)) - FLOOR_PERCENT) / (ceiling - FLOOR_PERCENT)

/**
 * A fixed floor keeps the height comparable between sessions; only a target
 * above it raises the ceiling. A sprint may run off the top — the scale is kept
 * for the targets, which are what the drawing is about.
 */
export const ceilingFor = (steps: readonly ExecutedStep[]): number =>
  Math.ceil(Math.max(FLOOR_CEILING, ...steps.map((step) => step.high + HEADROOM)) / 10) * 10

export type Corridor = {
  readonly step: ExecutedStep & { readonly span: Span }
  /** Runs as long as planned from where it started, so a cut short interval leaves it half empty. */
  readonly from: number
  readonly to: number
  readonly runs: readonly Span[]
}

export const corridorsOf = (steps: readonly ExecutedStep[], trace: ExecutionTrace): readonly Corridor[] =>
  steps
    .filter((step): step is Corridor['step'] => step.span !== null && step.verdict !== null)
    .map((step) => ({
      step,
      from: step.span.from,
      to: Math.max(step.span.to, step.span.from + step.plannedSeconds),
      runs: inTargetRuns(trace, step.span, step.low, step.high),
    }))

/** Full label where the corridor has the room, the verdict alone where it does not. */
export const corridorLabel = (corridor: Corridor, totalSeconds: number): string => {
  const { verdict, actualPercent } = corridor.step
  const symbol = verdict ? SYMBOL[verdict] : ''
  return (corridor.to - corridor.from) / totalSeconds >= 0.08 ? `${actualPercent} % ${symbol}` : symbol
}

/** Ten-minute ticks for an hour, wider for longer sessions, never more than eight. */
export const timeTicks = (seconds: number): readonly number[] => {
  const minutes = seconds / 60
  const every = [10, 15, 20, 30, 60].find((candidate) => minutes / candidate <= 8) ?? 120
  return Array.from({ length: Math.floor(minutes / every) + 1 }, (_, index) => index * every)
}

export const heartRange = (trace: ExecutionTrace): { readonly low: number; readonly high: number } | null => {
  const beats = trace.points.map((point) => point.heartRate).filter((beat): beat is number => beat !== null)
  if (beats.length === 0) return null
  const low = Math.floor(Math.min(...beats) / 10) * 10
  return { low, high: Math.max(low + 20, Math.ceil(Math.max(...beats) / 10) * 10) }
}

/**
 * A line through the points in the given box, broken where nothing was
 * recorded. An SVG path string, which a canvas takes as a Path2D too.
 */
export const linePath = (
  points: readonly { readonly x: number; readonly y: number | null }[],
  width: number,
  height: number,
): string =>
  points
    .reduce<{ readonly parts: readonly string[]; readonly open: boolean }>(
      (path, point) => {
        if (point.y === null) return { parts: path.parts, open: false }
        const x = (point.x * width).toFixed(1)
        const y = ((1 - Math.min(1, Math.max(0, point.y))) * height).toFixed(1)
        return { parts: [...path.parts, `${path.open ? 'L' : 'M'}${x},${y}`], open: true }
      },
      { parts: [], open: false },
    )
    .parts.join(' ')

type Fraction = { readonly x: number; readonly y: number | null }

/** The recorded stretches, each as its own list of points: a gap splits the line. */
const stretches = (points: readonly Fraction[]): readonly (readonly { x: number; y: number }[])[] =>
  points.reduce<readonly (readonly { x: number; y: number }[])[]>((all, point, index) => {
    if (point.y === null) return all
    const joined = index > 0 && points[index - 1]?.y !== null && all.length > 0
    const entry = { x: point.x, y: point.y }
    return joined ? [...all.slice(0, -1), [...all[all.length - 1]!, entry]] : [...all, [entry]]
  }, [])

/** The ground under the line, one closed shape per recorded stretch. */
export const areaPath = (points: readonly Fraction[], width: number, height: number): string =>
  stretches(points)
    .map((stretch) => {
      const xs = stretch.map((point) => (point.x * width).toFixed(1))
      const ys = stretch.map((point) => ((1 - Math.min(1, Math.max(0, point.y))) * height).toFixed(1))
      const edge = xs.map((x, index) => `L${x},${ys[index]}`).join(' ')
      return `M${xs[0]},${height} ${edge} L${xs[xs.length - 1]},${height} Z`
    })
    .join(' ')

/** The intensity line as fractions: x of the session, y of the ceiling. */
export const intensityLine = (trace: ExecutionTrace, ceiling: number) =>
  trace.points.map((point) => ({
    x: point.seconds / trace.seconds,
    y: point.percent === null ? null : heightOf(point.percent, ceiling),
  }))

export const heartLine = (trace: ExecutionTrace, range: { readonly low: number; readonly high: number }) =>
  trace.points.map((point) => ({
    x: point.seconds / trace.seconds,
    y: point.heartRate === null ? null : (point.heartRate - range.low) / (range.high - range.low),
  }))

export const clock = (seconds: number): string => {
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const rest = String(rounded % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** "252 W" or "4:05 /km", as the athlete reads it on the device. */
export const valueText = (value: number | null, metric: SportThreshold['metric']): string | null => {
  if (value === null) return null
  if (metric === 'power') return `${Math.round(value)} W`
  if (value <= 0) return null
  return `${clock(1000 / value)} /km`
}

export const intensityWord = (metric: SportThreshold['metric']): string =>
  metric === 'power' ? 'Leistung' : 'Tempo'

/** Intervals to judge, and the data to judge them by. */
export const isCompared = (execution: Execution): boolean =>
  execution.steps.length > 0 && execution.unavailable === null

/**
 * The trace, when every interval that was done has a place on its clock.
 * Without one, the strip tells the session more truthfully than a drawing
 * that silently leaves an interval out.
 */
export const drawableTrace = (execution: Execution): ExecutionTrace | null =>
  execution.trace &&
  (!isCompared(execution) ||
    execution.steps.every((step) => step.actualSeconds === null || step.span !== null))
    ? execution.trace
    : null

/** In the target, and of the target: what the headline of a shared session says. */
export const hitCount = (execution: Execution): { readonly hit: number; readonly planned: number } => ({
  hit: execution.steps.filter((step) => step.verdict === 'on').length,
  planned: execution.steps.length,
})
