import { describe, expect, it } from 'vitest'
import {
  FLOOR_PERCENT,
  areaPath,
  ceilingFor,
  corridorLabel,
  heartRange,
  heightOf,
  linePath,
  timeTicks,
  valueText,
} from '../src/ui/trace-geometry.ts'
import type { Corridor } from '../src/ui/trace-geometry.ts'
import type { ExecutedStep, ExecutionTrace } from '../src/coach/types.ts'

const step = (overrides: Partial<ExecutedStep> = {}): ExecutedStep => ({
  index: 1,
  plannedSeconds: 480,
  low: 95,
  high: 105,
  actualSeconds: 480,
  actualPercent: 104,
  actualValue: '260 W',
  verdict: 'on',
  cutShort: false,
  pieces: 1,
  span: { from: 0, to: 480 },
  heartRate: 158,
  ...overrides,
})

describe('the scale of the drawing', () => {
  it('keeps one ceiling for threshold work and lifts it only for targets above it', () => {
    expect(ceilingFor([step()])).toBe(140)
    expect(ceilingFor([step({ low: 120, high: 130 })])).toBe(150)
    expect(ceilingFor([])).toBe(140)
  })

  it('starts the scale above zero, so a narrow band has room, and keeps a stop on the floor', () => {
    expect(heightOf(FLOOR_PERCENT, 140)).toBe(0)
    expect(heightOf(0, 140)).toBe(0)
    expect(heightOf(140, 140)).toBe(1)
    expect(heightOf(250, 140)).toBe(1)
    // Twice the height a 0–140 scale gives the same ten points.
    expect(heightOf(105, 140) - heightOf(95, 140)).toBeGreaterThan(10 / 140)
  })

  it('ticks every ten minutes for an hour and wider for a long ride', () => {
    expect(timeTicks(71 * 60)).toEqual([0, 10, 20, 30, 40, 50, 60, 70])
    expect(timeTicks(4 * 3600).length).toBeLessThanOrEqual(9)
    expect(timeTicks(4 * 3600)[1]).toBe(30)
  })

  it('rounds the heart rate strip to tens around what was recorded', () => {
    const trace: ExecutionTrace = {
      seconds: 10,
      step: 5,
      smoothing: 10,
      points: [
        { seconds: 0, percent: 60, value: 150, heartRate: 112 },
        { seconds: 5, percent: 60, value: 150, heartRate: 171 },
      ],
    }
    expect(heartRange(trace)).toEqual({ low: 110, high: 180 })
    expect(heartRange({ ...trace, points: trace.points.map((point) => ({ ...point, heartRate: null })) })).toBeNull()
  })
})

describe('labels and readings', () => {
  const corridor = (from: number, to: number, overrides: Partial<ExecutedStep> = {}): Corridor => ({
    step: { ...step(overrides), span: { from, to } },
    from,
    to,
    runs: [],
  })

  it('names the percentage where the corridor has room and only the verdict where it does not', () => {
    expect(corridorLabel(corridor(0, 480), 4000)).toBe('104 % ✓')
    expect(corridorLabel(corridor(0, 120, { verdict: 'under', actualPercent: 90 }), 4000)).toBe('↓')
  })

  it('reads watts and pace the way the device shows them', () => {
    expect(valueText(252.4, 'power')).toBe('252 W')
    expect(valueText(1000 / 245, 'pace')).toBe('4:05 /km')
    expect(valueText(null, 'power')).toBeNull()
  })
})

describe('the line and the ground under it', () => {
  const points = [
    { x: 0, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.6, y: null },
    { x: 0.8, y: 1.2 },
    { x: 1, y: 0.25 },
  ]

  it('breaks the line where nothing was recorded and clips it to the box', () => {
    expect(linePath(points, 100, 10)).toBe('M0.0,5.0 L50.0,5.0 M80.0,0.0 L100.0,7.5')
  })

  it('closes one shape per recorded stretch on the ground', () => {
    expect(areaPath(points, 100, 10)).toBe(
      'M0.0,10 L0.0,5.0 L50.0,5.0 L50.0,10 Z M80.0,10 L80.0,0.0 L100.0,7.5 L100.0,10 Z',
    )
  })
})
