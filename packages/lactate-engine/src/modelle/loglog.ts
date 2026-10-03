import { el, leastSquares, mean, minimize, sum } from '../numerik.ts'
import type { Analysekontext, Schwellenergebnis, Warnung } from '../typen.ts'
import { ergebnis, randWarnung } from './gemeinsam.ts'

/**
 * So viel steiler muss das obere Segment mindestens sein (Differenz der Exponenten im
 * Log-Log-Raum), damit von einem Knick die Rede sein kann. Typische Tests liegen bei 2–4.
 */
const MIN_KNICK = 0.1

interface Knickfit {
  readonly knick: number
  readonly a: number
  readonly steigungUnten: number
  readonly steigungOben: number
  readonly sse: number
}

/**
 * Stetige zweisegmentige Regression y = a + b·x + c·max(0, x − k). Für festes k linear,
 * daher wird nur der Knick k gesucht.
 */
function knickfit(xs: readonly number[], ys: readonly number[], k: number): Knickfit {
  const [a = NaN, b = NaN, c = NaN] = leastSquares(
    xs.map((x) => [1, x, Math.max(0, x - k)]),
    ys,
  )
  const sse = sum(xs.map((x, i) => (el(ys, i) - a - b * x - c * Math.max(0, x - k)) ** 2))
  return { knick: k, a, steigungUnten: b, steigungOben: b + c, sse }
}

/**
 * Log-Log-Breakpoint (Beaver 1985): log(Laktat) gegen log(Intensität), zwei Geraden mit
 * gemeinsamem Knickpunkt, Knick dort, wo die Fehlerquadratsumme minimal ist. Rechnet auf den
 * Messwerten, nicht auf der angepassten Kurve. Der Knick liegt mindestens zwei Stufen vom
 * Rand entfernt, damit jedes Segment von mindestens zwei Messwerten getragen wird.
 */
export function logLog(ctx: Analysekontext): Schwellenergebnis {
  const { stufen } = ctx.protokoll
  const xs = stufen.map((s) => Math.log(s.intensitaet))
  const ys = stufen.map((s) => Math.log(s.laktat))
  const n = xs.length
  const lo = el(xs, 1)
  const hi = el(xs, n - 2)
  const k = minimize((t) => knickfit(xs, ys, t).sse, lo, hi, 1000)
  const fit = knickfit(xs, ys, k)
  const my = mean(ys)
  const r2 = 1 - fit.sse / sum(ys.map((y) => (y - my) ** 2))
  const warnungen: Warnung[] = []
  const details = { steigungUnten: fit.steigungUnten, steigungOben: fit.steigungOben, r2 }
  if (!(fit.steigungOben - fit.steigungUnten >= MIN_KNICK)) {
    return ergebnis(
      'log-log',
      'log-log',
      ctx,
      {
        wert: null,
        laktat: null,
        warnungen: [
          {
            code: 'KEIN_KNICK',
            schwere: 'warnung',
            nachricht: 'Log-Log: kein Knick nach oben erkennbar; der Breakpoint lässt sich nicht bestimmen.',
          },
        ],
        details,
      },
      false,
    )
  }
  const toleranz = (hi - lo) * 0.01
  if (k - lo <= toleranz || hi - k <= toleranz) warnungen.push(randWarnung('Der Log-Log-Breakpoint'))
  return ergebnis(
    'log-log',
    'log-log',
    ctx,
    { wert: Math.exp(k), laktat: Math.exp(fit.a + fit.steigungUnten * k), warnungen, details },
    false,
  )
}
