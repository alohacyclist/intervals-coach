import { describe, expect, it } from 'vitest'
import { bisect, isotonic, leastSquares, linearFit, minimize } from '../src/numerik.ts'

describe('leastSquares', () => {
  it('löst ein überbestimmtes System mit exakter Lösung', () => {
    const xs = [1, 2, 3, 4, 5]
    const A = xs.map((x) => [1, x, x * x])
    const b = xs.map((x) => 2 - 3 * x + 0.5 * x * x)
    const c = leastSquares(A, b)
    expect(c[0]).toBeCloseTo(2, 10)
    expect(c[1]).toBeCloseTo(-3, 10)
    expect(c[2]).toBeCloseTo(0.5, 10)
  })

  it('kommt mit sehr unterschiedlich großen Spalten zurecht', () => {
    const s = [0, 0.25, 0.5, 0.75, 1]
    const A = s.map((x) => [1, Math.exp(30 * x)])
    const b = s.map((x) => 1 + 1e-12 * Math.exp(30 * x))
    const [a, k] = leastSquares(A, b)
    expect(a).toBeCloseTo(1, 8)
    expect((k ?? 0) / 1e-12).toBeCloseTo(1, 6)
  })

  it('erkennt linear abhängige Spalten', () => {
    expect(() => leastSquares([[1, 2], [2, 4], [3, 6]], [1, 2, 3])).toThrow(/singulär/)
  })

  it('liefert die Regressionsgerade', () => {
    const { a, b } = linearFit([0, 1, 2, 3], [1, 3, 5, 7])
    expect(a).toBeCloseTo(1, 12)
    expect(b).toBeCloseTo(2, 12)
  })
})

describe('minimize', () => {
  it('findet das globale Minimum trotz lokaler Minima', () => {
    const f = (x: number) => Math.sin(3 * x) + 0.1 * (x - 2) ** 2
    const x = minimize(f, -3, 6)
    // Referenz: feines Raster
    let best = -3
    for (let t = -3; t <= 6; t += 1e-5) if (f(t) < f(best)) best = t
    expect(x).toBeCloseTo(best, 4)
  })

  it('erkennt ein Minimum am Rand', () => {
    expect(minimize((x) => x, 2, 5)).toBe(2)
  })
})

describe('bisect', () => {
  it('findet die Nullstelle', () => {
    expect(bisect((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 9)
  })
})

describe('isotonic', () => {
  it('lässt eine steigende Folge unverändert', () => {
    expect(isotonic([1, 2, 2, 3])).toEqual([1, 2, 2, 3])
  })

  it('mittelt fallende Nachbarn', () => {
    expect(isotonic([1, 3, 2, 4])).toEqual([1, 2.5, 2.5, 4])
    expect(isotonic([3, 2, 1])).toEqual([2, 2, 2])
  })
})
