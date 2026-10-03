import { el, isotonic, leastSquares, mean, minimize, sum } from './numerik.ts'
import { ProtokollFehler } from './protokoll.ts'
import type { GeprueftesProtokoll, Kurve, Kurventyp, Warnung } from './typen.ts'
import { KURVEN_VERSIONEN } from './versionen.ts'

/** Unterhalb dieses Bestimmtheitsmaßes beschreibt die Kurve die Messwerte schlecht. */
const R2_SCHWACH = 0.95

interface Messreihe {
  readonly xs: readonly number[]
  readonly ys: readonly number[]
}

function messreihe(protokoll: GeprueftesProtokoll): Messreihe {
  return {
    xs: protokoll.stufen.map((s) => s.intensitaet),
    ys: protokoll.stufen.map((s) => s.laktat),
  }
}

function guete(
  { xs, ys }: Messreihe,
  f: (x: number) => number,
): { r2: number; rmse: number; residuen: number[] } {
  const residuen = xs.map((x, i) => el(ys, i) - f(x))
  const ssRes = sum(residuen.map((r) => r * r))
  const my = mean(ys)
  const ssTot = sum(ys.map((y) => (y - my) ** 2))
  return {
    r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot,
    rmse: Math.sqrt(ssRes / xs.length),
    residuen,
  }
}

function fmt(x: number): string {
  return x.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

/** Warnungen, die für jede Kurve gleich gelten: Güte, Residuen, Form. */
function kurvenWarnungen(
  typ: Kurventyp,
  reihe: Messreihe,
  f: (x: number) => number,
  g: { r2: number; residuen: readonly number[] },
): Warnung[] {
  const warnungen: Warnung[] = []
  if (g.r2 < R2_SCHWACH) {
    warnungen.push({
      code: 'ANPASSUNG_SCHWACH',
      schwere: 'warnung',
      nachricht: `Die Kurve erklärt die Messwerte nur mäßig (R² = ${fmt(g.r2)}). Messwerte prüfen oder anderes Kurvenmodell wählen.`,
    })
  }
  g.residuen.forEach((r, i) => {
    const y = el(reihe.ys, i)
    // Bei hohem Laktat streuen Messungen stärker, daher relativ ab 5 mmol/L.
    if (Math.abs(r) > Math.max(0.5, 0.1 * y)) {
      warnungen.push({
        code: 'RESIDUUM_GROSS',
        schwere: 'warnung',
        nachricht: `Stufe ${i + 1}: Messwert weicht ${fmt(Math.abs(r))} mmol/L von der Kurve ab – möglicher Ausreißer.`,
        stufenIndex: i,
      })
    }
  })
  const xMin = el(reihe.xs, 0)
  const xMax = el(reihe.xs, reihe.xs.length - 1)
  if (typ === 'polynom3') {
    const h = (xMax - xMin) * 1e-3
    if (f(xMax) < f(xMax - h)) {
      warnungen.push({
        code: 'KURVE_FAELLT_AM_ENDE',
        schwere: 'warnung',
        nachricht: 'Das Polynom fällt zur letzten Stufe hin ab; obere Schwellen sind dort unzuverlässig. Exponentialfit oder Spline vergleichen.',
      })
    }
    const xLow = minimize(f, xMin, xMax, 400)
    if (f(xLow) <= 0) {
      warnungen.push({
        code: 'KURVE_NEGATIV',
        schwere: 'warnung',
        nachricht: 'Das Polynom sinkt im Messbereich unter 0 mmol/L; untere Schwellen sind dort nicht verwertbar.',
      })
    }
  }
  return warnungen
}

/** Polynom 3. Grades nach kleinsten Quadraten, auf zentrierter und skalierter Intensität gerechnet. */
export function polynom3(protokoll: GeprueftesProtokoll): Kurve {
  const reihe = messreihe(protokoll)
  const { xs, ys } = reihe
  const m = mean(xs)
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
  const t = (x: number) => (x - m) / sd
  const c = leastSquares(
    xs.map((x) => {
      const u = t(x)
      return [1, u, u * u, u * u * u]
    }),
    ys,
  )
  const [c0, c1, c2, c3] = [el(c, 0), el(c, 1), el(c, 2), el(c, 3)]
  const f = (x: number) => {
    const u = t(x)
    return c0 + u * (c1 + u * (c2 + u * c3))
  }
  // Ausmultipliziert in Rohintensität: La = a0 + a1·x + a2·x² + a3·x³ (wie in WinLactat angezeigt).
  const b = [c0, c1 / sd, c2 / sd ** 2, c3 / sd ** 3]
  const a = [0, 0, 0, 0]
  const binom = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]
  for (let k = 0; k <= 3; k++) {
    const bk = el(b, k)
    const zeile = binom[k] ?? []
    for (let j = 0; j <= k; j++) a[j] = el(a, j) + bk * el(zeile, j) * (-m) ** (k - j)
  }
  const g = guete(reihe, f)
  return {
    typ: 'polynom3',
    version: KURVEN_VERSIONEN.polynom3,
    xMin: el(xs, 0),
    xMax: el(xs, xs.length - 1),
    f,
    parameter: { a0: el(a, 0), a1: el(a, 1), a2: el(a, 2), a3: el(a, 3) },
    ...g,
    warnungen: kurvenWarnungen('polynom3', reihe, f, g),
  }
}

const K_MIN = 0.01
const K_MAX = 30

/**
 * La = a + b·e^(c·x). Für festes c sind a und b linear, daher wird nur c eindimensional
 * gesucht (variable Projektion) – robust ohne Startwerte. Gesucht wird auf normierter
 * Intensität s = (x − xMin)/(xMax − xMin), damit das Suchintervall für Watt wie km/h passt.
 */
export function exponential(protokoll: GeprueftesProtokoll): Kurve {
  const reihe = messreihe(protokoll)
  const { xs, ys } = reihe
  const x0 = el(xs, 0)
  const span = el(xs, xs.length - 1) - x0
  const s = xs.map((x) => (x - x0) / span)
  const loese = (k: number): { a: number; b: number; sse: number } => {
    let koeff: number[]
    try {
      koeff = leastSquares(
        s.map((si) => [1, Math.exp(k * si)]),
        ys,
      )
    } catch {
      return { a: NaN, b: NaN, sse: Infinity }
    }
    const [a = NaN, b = NaN] = koeff
    if (!(b > 0)) return { a, b, sse: Infinity }
    let sse = 0
    s.forEach((si, i) => {
      sse += (el(ys, i) - a - b * Math.exp(k * si)) ** 2
    })
    return { a, b, sse }
  }
  // Suche über log(k): die Fehlerfläche ist dort deutlich gleichmäßiger.
  const logK = minimize((lk) => loese(Math.exp(lk)).sse, Math.log(K_MIN), Math.log(K_MAX), 600)
  const k = Math.exp(logK)
  const { a, b, sse } = loese(k)
  const warnungen: Warnung[] = []
  if (!Number.isFinite(sse)) {
    throw new ProtokollFehler(['Exponentialfit nicht möglich: die Messwerte steigen nicht exponentiell an.'])
  }
  const f = (x: number) => a + b * Math.exp((k * (x - x0)) / span)
  if (k <= K_MIN * 1.01 || k >= K_MAX * 0.99) {
    warnungen.push({
      code: 'EXPONENTIAL_GRENZWERT',
      schwere: 'warnung',
      nachricht: 'Der Exponentialfit stößt an seine Grenze (Kurve fast linear oder extrem steil); ein anderes Kurvenmodell vergleichen.',
    })
  }
  const g = guete(reihe, f)
  const c = k / span
  return {
    typ: 'exponential',
    version: KURVEN_VERSIONEN.exponential,
    xMin: x0,
    xMax: x0 + span,
    f,
    // La = a + b·e^(c·x) in Rohintensität; b kann bei großen Intensitäten sehr klein werden.
    parameter: { a, b: b * Math.exp(-c * x0), c },
    ...g,
    warnungen: [...warnungen, ...kurvenWarnungen('exponential', reihe, f, g)],
  }
}

/**
 * Monoton steigender kubischer Spline durch die Messwerte (Steffen 1990).
 * Fallen Messwerte trotz steigender Last, werden sie vorher per isotoner Regression
 * gemittelt – der Spline kann sonst nicht monoton sein.
 */
export function monotonerSpline(protokoll: GeprueftesProtokoll): Kurve {
  const reihe = messreihe(protokoll)
  const { xs } = reihe
  const ys = isotonic(reihe.ys)
  const n = xs.length
  const h = xs.slice(0, -1).map((x, i) => el(xs, i + 1) - x)
  const d = h.map((hi, i) => (el(ys, i + 1) - el(ys, i)) / hi)
  const dy = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const h0 = el(h, i - 1)
    const h1 = el(h, i)
    const d0 = el(d, i - 1)
    const d1 = el(d, i)
    const p = (d0 * h1 + d1 * h0) / (h0 + h1)
    dy[i] = (Math.sign(d0) + Math.sign(d1)) * Math.min(Math.abs(d0), Math.abs(d1), 0.5 * Math.abs(p))
  }
  const rand = (dA: number, dB: number, hA: number, hB: number): number => {
    const p = dA * (1 + hA / (hA + hB)) - (dB * hA) / (hA + hB)
    if (p * dA <= 0) return 0
    if (Math.abs(p) > 2 * Math.abs(dA)) return 2 * dA
    return p
  }
  dy[0] = rand(el(d, 0), el(d, 1), el(h, 0), el(h, 1))
  dy[n - 1] = rand(el(d, n - 2), el(d, n - 3), el(h, n - 2), el(h, n - 3))

  const xMin = el(xs, 0)
  const xMax = el(xs, n - 1)
  const f = (x: number): number => {
    if (x <= xMin) return el(ys, 0) + el(dy, 0) * (x - xMin)
    if (x >= xMax) return el(ys, n - 1) + el(dy, n - 1) * (x - xMax)
    let i = 0
    while (i < n - 2 && x > el(xs, i + 1)) i++
    const hi = el(h, i)
    const t = (x - el(xs, i)) / hi
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * el(ys, i) +
      (t3 - 2 * t2 + t) * hi * el(dy, i) +
      (-2 * t3 + 3 * t2) * el(ys, i + 1) +
      (t3 - t2) * hi * el(dy, i + 1)
    )
  }
  const warnungen: Warnung[] = []
  const geglaettet = reihe.ys.flatMap((y, i) => (Math.abs(y - el(ys, i)) > 1e-12 ? [i + 1] : []))
  if (geglaettet.length > 0) {
    warnungen.push({
      code: 'SPLINE_GEGLAETTET',
      schwere: 'info',
      nachricht: `Für den monotonen Spline wurden fallende Messwerte gemittelt (Stufe ${geglaettet.join(', ')}).`,
    })
  }
  const g = guete(reihe, f)
  return {
    typ: 'monotoner-spline',
    version: KURVEN_VERSIONEN['monotoner-spline'],
    xMin,
    xMax,
    f,
    parameter: { knoten: n },
    ...g,
    warnungen: [...warnungen, ...kurvenWarnungen('monotoner-spline', reihe, f, g)],
  }
}

export function passeKurveAn(protokoll: GeprueftesProtokoll, typ: Kurventyp = 'polynom3'): Kurve {
  switch (typ) {
    case 'polynom3':
      return polynom3(protokoll)
    case 'exponential':
      return exponential(protokoll)
    case 'monotoner-spline':
      return monotonerSpline(protokoll)
  }
}

/** Gleichmäßig abgetastete Kurvenpunkte für Diagramme und zum Speichern. */
export function tasteKurveAb(kurve: Kurve, punkte = 101): { x: number; laktat: number }[] {
  const h = (kurve.xMax - kurve.xMin) / (punkte - 1)
  return Array.from({ length: punkte }, (_, i) => {
    const x = kurve.xMin + i * h
    return { x, laktat: kurve.f(x) }
  })
}
