import type { DashboardWeek, RideTrace } from '../../coach/dashboard.ts'

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
): { readonly path: string; readonly min: number; readonly max: number } => {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return { path: '', min: 0, max: 0 }
  const low = Math.min(...known)
  const high = Math.max(...known)
  const span = high - low || 0.1
  const y = (v: number) => pad + ((high - v) / span) * (height - 2 * pad)
  let open = false
  const path = values
    .map((v, i) => {
      if (v === null) {
        open = false
        return ''
      }
      const step = `${open ? 'L' : 'M'}${fixed(centres[i] ?? 0)} ${fixed(y(v))}`
      open = true
      return step
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
  const line = (y: (m: (typeof minutes)[number]) => number) =>
    minutes
      .map((m, i) => {
        const joined = i > 0 && minutes[i - 1]?.minute === m.minute - 1
        return `${joined ? 'L' : 'M'}${fixed(x(m.minute))} ${fixed(y(m))}`
      })
      .join(' ')
  return {
    powerPath: line((m) => yPower(m.watts)),
    hrPath: line((m) => yHeart(m.heartRate)),
    powerMax,
    hrMin,
    hrMax,
    lastMinute,
    x,
    yPower,
    yHeart,
  }
}
