/**
 * Kleine numerische Werkzeuge: lineare Ausgleichsrechnung, Nullstellen, Minima,
 * isotone Regression. Bewusst ohne Abhängigkeit, die Probleme sind winzig (≤ 4 Parameter,
 * ≤ ~20 Punkte) und so bleibt jede Rechnung nachvollziehbar.
 */

/** Element `i`; wirft statt `undefined` zurückzugeben, damit Indexfehler nicht still NaN werden. */
export function el(a: ArrayLike<number>, i: number): number {
  const v = a[i]
  if (v === undefined) throw new RangeError(`Index ${i} außerhalb von [0, ${a.length})`)
  return v
}

function row(m: readonly number[][], i: number): number[] {
  const r = m[i]
  if (r === undefined) throw new RangeError(`Zeile ${i} außerhalb von [0, ${m.length})`)
  return r
}

export function sum(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

export function mean(xs: readonly number[]): number {
  return sum(xs) / xs.length
}

/**
 * Löst min ‖A·c − b‖² über Householder-QR. Stabiler als die Normalgleichungen,
 * was bei kubischen Polynomen über Wattwerten schnell zählt. Die Spalten werden vorher
 * auf Länge 1 normiert, damit sehr unterschiedlich große Basisfunktionen (etwa 1 und
 * e^(40·s)) nicht fälschlich als linear abhängig gelten.
 */
export function leastSquares(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const m = A.length
  const n = A[0]?.length ?? 0
  if (m < n || n === 0) throw new Error(`Ausgleichsrechnung braucht mindestens ${n} Zeilen, hat ${m}`)
  const norms = Array.from({ length: n }, (_, j) => Math.sqrt(sum(A.map((r) => el(r, j) ** 2))))
  if (norms.some((x) => !(x > 0) || !Number.isFinite(x))) throw new Error('Ausgleichsrechnung ist singulär')
  const R = A.map((r) => r.map((v, j) => v / el(norms, j)))
  const y = [...b]
  for (let k = 0; k < n; k++) {
    let norm = 0
    for (let i = k; i < m; i++) norm += el(row(R, i), k) ** 2
    norm = Math.sqrt(norm)
    if (norm === 0) continue
    const rkk = el(row(R, k), k)
    const alpha = rkk > 0 ? -norm : norm
    const v = new Array<number>(m).fill(0)
    v[k] = rkk - alpha
    for (let i = k + 1; i < m; i++) v[i] = el(row(R, i), k)
    let vv = 0
    for (let i = k; i < m; i++) vv += el(v, i) ** 2
    if (vv === 0) continue
    for (let j = k; j < n; j++) {
      let s = 0
      for (let i = k; i < m; i++) s += el(v, i) * el(row(R, i), j)
      const f = (2 * s) / vv
      for (let i = k; i < m; i++) row(R, i)[j] = el(row(R, i), j) - f * el(v, i)
    }
    let s = 0
    for (let i = k; i < m; i++) s += el(v, i) * el(y, i)
    const f = (2 * s) / vv
    for (let i = k; i < m; i++) y[i] = el(y, i) - f * el(v, i)
  }
  let scale = 0
  for (let k = 0; k < n; k++) scale = Math.max(scale, Math.abs(el(row(R, k), k)))
  const c = new Array<number>(n).fill(0)
  for (let k = n - 1; k >= 0; k--) {
    const rkk = el(row(R, k), k)
    if (Math.abs(rkk) <= 1e-12 * scale) throw new Error('Ausgleichsrechnung ist singulär')
    let s = el(y, k)
    for (let j = k + 1; j < n; j++) s -= el(row(R, k), j) * el(c, j)
    c[k] = s / rkk
  }
  return c.map((v, j) => v / el(norms, j))
}

const PHI = (Math.sqrt(5) - 1) / 2

/** Goldener Schnitt: Minimum einer auf [a, b] unimodalen Funktion. */
export function goldenMin(f: (x: number) => number, a: number, b: number, tol = 1e-9): number {
  let lo = a
  let hi = b
  let x1 = hi - PHI * (hi - lo)
  let x2 = lo + PHI * (hi - lo)
  let f1 = f(x1)
  let f2 = f(x2)
  while (hi - lo > tol * Math.max(1, Math.abs(lo) + Math.abs(hi))) {
    if (f1 <= f2) {
      hi = x2
      x2 = x1
      f2 = f1
      x1 = hi - PHI * (hi - lo)
      f1 = f(x1)
    } else {
      lo = x1
      x1 = x2
      f1 = f2
      x2 = lo + PHI * (hi - lo)
      f2 = f(x2)
    }
  }
  return (lo + hi) / 2
}

/**
 * Globales Minimum auf [a, b]: erst ein feines Raster, damit mehrere lokale Minima
 * nicht täuschen, dann goldener Schnitt zwischen den Nachbarn des besten Rasterpunkts.
 */
export function minimize(f: (x: number) => number, a: number, b: number, steps = 2000): number {
  if (!(b > a)) return a
  const h = (b - a) / steps
  let best = 0
  let bestVal = Infinity
  for (let i = 0; i <= steps; i++) {
    const v = f(a + i * h)
    if (v < bestVal) {
      bestVal = v
      best = i
    }
  }
  const lo = a + Math.max(0, best - 1) * h
  const hi = a + Math.min(steps, best + 1) * h
  const x = goldenMin(f, lo, hi)
  // Der Rasterpunkt selbst kann besser sein, etwa wenn das Minimum am Rand liegt.
  return f(x) <= bestVal ? x : a + best * h
}

/** Bisektion auf [a, b] mit Vorzeichenwechsel von f. */
export function bisect(f: (x: number) => number, a: number, b: number, tol = 1e-10): number {
  let lo = a
  let hi = b
  let flo = f(lo)
  for (let i = 0; i < 200 && hi - lo > tol * Math.max(1, Math.abs(lo)); i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (fm === 0) return mid
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid
      flo = fm
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

/**
 * Isotone Regression (Pool Adjacent Violators): die nicht fallende Folge mit dem
 * kleinsten quadratischen Abstand zu `y`.
 */
export function isotonic(y: readonly number[]): number[] {
  const blocks: { value: number; weight: number }[] = []
  for (const v of y) {
    blocks.push({ value: v, weight: 1 })
    for (;;) {
      const last = blocks[blocks.length - 1]
      const prev = blocks[blocks.length - 2]
      if (last === undefined || prev === undefined || prev.value <= last.value) break
      const weight = prev.weight + last.weight
      blocks.splice(-2, 2, { value: (prev.value * prev.weight + last.value * last.weight) / weight, weight })
    }
  }
  return blocks.flatMap((b) => new Array<number>(b.weight).fill(b.value))
}

/** Lineare Regression y = a + b·x. */
export function linearFit(xs: readonly number[], ys: readonly number[]): { a: number; b: number } {
  const [a, b] = leastSquares(
    xs.map((x) => [1, x]),
    ys,
  )
  return { a: a ?? NaN, b: b ?? NaN }
}
