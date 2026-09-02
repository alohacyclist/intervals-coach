import { describe, expect, it } from 'vitest'
import { toHumanSteps, toIntervalsText } from '../src/coach/format.ts'
import { findTemplate } from '../src/coach/library.ts'
import { BIKE_THRESHOLD, RUN_THRESHOLD, SWIM_THRESHOLD } from './fixtures.ts'

const template = (id: string) => {
  const found = findTemplate(id)
  if (!found) throw new Error(`missing template ${id}`)
  return found
}

describe('workout formatting', () => {
  it('renders repeat blocks with the blank lines intervals.icu requires', () => {
    const text = toIntervalsText(template('bike-vo2-5x4').blocks)
    expect(text).toContain('\n\n5x\n- 4m 110-115% 90-100rpm\n- 4m 50%\n\n')
    expect(text.split('\n')[0]).toBe('- 15m ramp 50%-72% Einfahren')
  })

  it('converts power percentages into watts', () => {
    const steps = toHumanSteps(template('bike-thr-3x12').blocks, BIKE_THRESHOLD)
    expect(steps.join(' ')).toContain('272–286 W')
  })

  it('converts pace percentages into min/km, faster percentage first', () => {
    const steps = toHumanSteps(template('run-thr-5x1k').blocks, RUN_THRESHOLD)
    expect(steps[1]).toContain('1 km @ 3:47–3:56/km')
  })

  it('renders ramps with an arrow', () => {
    const steps = toHumanSteps(template('bike-vo2-5x4').blocks, BIKE_THRESHOLD)
    expect(steps[0]).toContain('140→202 W (Rampe)')
  })

  it('renders metre based intervals', () => {
    const steps = toHumanSteps(template('run-vo2-10x400').blocks, RUN_THRESHOLD)
    expect(steps.join(' ')).toContain('400 m @')
  })

  it('renders swim targets per 100 m', () => {
    const steps = toHumanSteps(template('swim-thr-10x100').blocks, SWIM_THRESHOLD)
    expect(steps.join(' ')).toContain('/100m')
    // 100% of a 1:50 CSS, give or take the range.
    expect(steps[2]).toContain('100 m @ 1:48–1:52/100m')
  })

  it('keeps swim distances in metres', () => {
    const steps = toHumanSteps(template('swim-endurance-1500').blocks, SWIM_THRESHOLD)
    expect(steps.join(' ')).toContain('1500 m @')
  })
})
