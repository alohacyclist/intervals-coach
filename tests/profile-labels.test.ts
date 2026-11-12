import { describe, expect, it } from 'vitest'
import { axisTicks, blockLabels } from '../src/ui/profile-labels.ts'
import type { ProfileSegment } from '../src/coach/types.ts'

const segment = (minutes: number, percent: number, target: string | null): ProfileSegment => ({
  seconds: minutes * 60,
  percent,
  intensity: percent >= 95 ? 'hard' : percent >= 80 ? 'moderate' : 'easy',
  label: null,
  target,
})

const warm = segment(15, 60, '150 W')
const cool = segment(8, 55, '138 W')
const rest = (minutes: number) => segment(minutes, 50, '125 W')

describe('numbers on the drawn workout', () => {
  it('writes the target on every block of work that is wide enough for it', () => {
    const labels = blockLabels([warm, segment(20, 100, '277–289 W'), rest(8), segment(20, 100, '277–289 W'), cool])
    expect(labels.map((label) => label.text)).toEqual(['277–289 W', '277–289 W'])
    // Over the middle of its block: 15 of 71 minutes in, ten further.
    expect(labels[0]?.at).toBeCloseTo((25 / 71) * 100, 5)
    expect(labels[0]?.percent).toBe(100)
  })

  it('writes one number over blocks too narrow for their own', () => {
    const work = Array.from({ length: 5 }, () => [segment(4, 112, '275–288 W'), rest(4)]).flat()
    const labels = blockLabels([warm, ...work, cool])
    expect(labels).toHaveLength(1)
    expect(labels[0]?.text).toBe('5 × 275–288 W')
  })

  it('leaves the easy blocks between intervals bare', () => {
    const labels = blockLabels([warm, segment(20, 100, '277–289 W'), rest(8), cool])
    expect(labels.map((label) => label.text)).not.toContain('125 W')
  })

  it('names the one long block of a session without hard work', () => {
    expect(blockLabels([segment(10, 60, '150 W'), segment(55, 68, '163–180 W'), cool]).map((label) => label.text)).toEqual([
      '163–180 W',
    ])
  })

  it('writes nothing where there is no one value to hold', () => {
    expect(blockLabels([segment(40, 60, null)])).toEqual([])
    expect(blockLabels([])).toEqual([])
  })

  it('never prints two shared numbers over the same stretch', () => {
    const mixed = Array.from({ length: 6 }, () => [segment(1, 120, '300 W'), segment(1, 100, '250 W')]).flat()
    expect(blockLabels([warm, ...mixed, cool]).length).toBeLessThanOrEqual(1)
  })
})

describe('minutes along the bottom', () => {
  it('uses round steps, few enough for a phone', () => {
    expect(axisTicks(78 * 60).map((tick) => tick.minutes)).toEqual([0, 15, 30, 45, 60])
    expect(axisTicks(40 * 60).map((tick) => tick.minutes)).toEqual([0, 10, 20, 30])
    expect(axisTicks(150 * 60).map((tick) => tick.minutes)).toEqual([0, 30, 60, 90, 120])
  })

  it('stops short of the end, where the length of the session stands', () => {
    for (const minutes of [25, 30, 45, 60, 65, 90, 120, 300]) {
      const ticks = axisTicks(minutes * 60)
      expect(ticks.length).toBeLessThanOrEqual(7)
      expect(Math.max(...ticks.map((tick) => tick.at))).toBeLessThanOrEqual(80)
    }
  })

  it('has nothing to say about a session without length', () => {
    expect(axisTicks(0)).toEqual([])
  })
})
