import { describe, expect, it } from 'vitest'
import { computeReadiness } from '../src/coach/readiness.ts'
import { baselineWellness, TODAY, wellness } from './fixtures.ts'

describe('readiness', () => {
  it('is green with a normal morning and neutral form', () => {
    const result = computeReadiness([wellness(0), ...baselineWellness()], TODAY, 0)
    expect(result.score).toBe('green')
  })

  it('flags a suppressed HRV', () => {
    const baseline = baselineWellness().map((entry, index) => ({
      ...entry,
      hrv: 70 + (index % 5) - 2,
    }))
    const result = computeReadiness([wellness(0, { hrv: 45 }), ...baseline], TODAY, 0)
    expect(result.score).toBe('red')
    expect(result.reasons.join(' ')).toContain('HRV')
  })

  it('flags an elevated resting heart rate', () => {
    const baseline = baselineWellness().map((entry, index) => ({
      ...entry,
      restingHr: 45 + (index % 3) - 1,
    }))
    const result = computeReadiness([wellness(0, { restingHr: 60 }), ...baseline], TODAY, 0)
    expect(result.reasons.join(' ')).toContain('Ruhepuls')
  })

  it('escalates to red when form is deeply negative', () => {
    expect(computeReadiness([wellness(0), ...baselineWellness()], TODAY, -35).score).toBe('red')
  })

  it('combines two amber flags into red', () => {
    const result = computeReadiness(
      [wellness(0, { sleepSecs: 5 * 3600, fatigue: 3 }), ...baselineWellness()],
      TODAY,
      0,
    )
    expect(result.score).toBe('red')
  })

  it('stays green without enough baseline samples', () => {
    expect(computeReadiness([wellness(0, { hrv: 20 })], TODAY, 0).score).toBe('green')
  })
})
