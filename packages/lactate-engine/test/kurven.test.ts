import { describe, expect, it } from 'vitest'
import { exponential, monotonerSpline, polynom3, pruefeProtokoll, tasteKurveAb } from '../src/index.ts'
import { WATT, rad, stufenAus } from './helfer.ts'

const kubisch = (x: number) => 1.2 - 0.01 * x + 4e-5 * x * x + 1e-7 * x ** 3

describe('Polynom 3. Grades', () => {
  it('reproduziert exakte kubische Daten samt Koeffizienten', () => {
    const k = polynom3(pruefeProtokoll(rad(stufenAus(WATT, kubisch))))
    expect(k.r2).toBeCloseTo(1, 12)
    expect(k.rmse).toBeLessThan(1e-10)
    expect(k.f(222)).toBeCloseTo(kubisch(222), 10)
    expect(k.parameter.a0).toBeCloseTo(1.2, 8)
    expect(k.parameter.a1).toBeCloseTo(-0.01, 10)
    expect(k.parameter.a2).toBeCloseTo(4e-5, 12)
    expect(k.parameter.a3).toBeCloseTo(1e-7, 14)
    expect(k.warnungen).toEqual([])
  })

  it('warnt, wenn das Polynom zur letzten Stufe hin fällt', () => {
    const stufen = [1.0, 1.1, 1.6, 3.0, 5.5, 6.5, 6.6].map((laktat, i) => ({ intensitaet: 100 + 40 * i, laktat }))
    const k = polynom3(pruefeProtokoll(rad(stufen)))
    expect(k.warnungen.map((w) => w.code)).toContain('KURVE_FAELLT_AM_ENDE')
  })

  it('markiert einen Messwert weit neben der Kurve', () => {
    const stufen = stufenAus(WATT, kubisch).map((s, i) => (i === 3 ? { ...s, laktat: s.laktat + 1.5 } : s))
    const k = polynom3(pruefeProtokoll(rad([...stufen, { intensitaet: 400, laktat: kubisch(400) }])))
    expect(k.warnungen.some((w) => w.code === 'RESIDUUM_GROSS' && w.stufenIndex === 3)).toBe(true)
  })
})

describe('Exponentialfit', () => {
  it('findet die Parameter exakter Exponentialdaten', () => {
    const f = (x: number) => 0.7 + 0.04 * Math.exp(0.016 * x)
    const k = exponential(pruefeProtokoll(rad(stufenAus(WATT, f))))
    expect(k.r2).toBeCloseTo(1, 10)
    expect(k.parameter.a).toBeCloseTo(0.7, 6)
    expect(k.parameter.b).toBeCloseTo(0.04, 6)
    expect(k.parameter.c).toBeCloseTo(0.016, 8)
    expect(k.f(275)).toBeCloseTo(f(275), 8)
  })

  it('lehnt Messwerte ab, die nicht ansteigen', () => {
    const stufen = [3, 2.8, 2.5, 2.2, 2.0].map((laktat, i) => ({ intensitaet: 100 + 50 * i, laktat }))
    expect(() => exponential(pruefeProtokoll(rad(stufen)))).toThrow(/Exponentialfit/)
  })
})

describe('Monotoner Spline', () => {
  it('geht durch steigende Messwerte und steigt überall', () => {
    const ys = [1.0, 1.1, 1.5, 2.4, 4.1, 7.0]
    const stufen = ys.map((laktat, i) => ({ intensitaet: WATT[i] ?? 0, laktat }))
    const k = monotonerSpline(pruefeProtokoll(rad(stufen)))
    stufen.forEach((s) => {
      expect(k.f(s.intensitaet)).toBeCloseTo(s.laktat, 12)
    })
    const punkte = tasteKurveAb(k, 1001)
    for (let i = 1; i < punkte.length; i++) {
      expect(punkte[i]?.laktat ?? 0).toBeGreaterThanOrEqual((punkte[i - 1]?.laktat ?? 0) - 1e-12)
    }
    expect(k.warnungen).toEqual([])
  })

  it('mittelt fallende Messwerte und sagt das', () => {
    const ys = [1.4, 1.2, 1.5, 2.4, 4.1, 7.0]
    const stufen = ys.map((laktat, i) => ({ intensitaet: WATT[i] ?? 0, laktat }))
    const k = monotonerSpline(pruefeProtokoll(rad(stufen)))
    expect(k.f(100)).toBeCloseTo(1.3, 12)
    expect(k.f(150)).toBeCloseTo(1.3, 12)
    expect(k.warnungen.map((w) => w.code)).toContain('SPLINE_GEGLAETTET')
  })
})
