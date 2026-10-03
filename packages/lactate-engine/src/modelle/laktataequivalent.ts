import { minimize } from '../numerik.ts'
import { amRand, ersteKreuzung } from '../suche.ts'
import type { Analysekontext, Schwellenergebnis, Warnung } from '../typen.ts'
import { ergebnis, fmt, randWarnung } from './gemeinsam.ts'

/**
 * Minimum des Laktatäquivalents (Laktat / Intensität) auf der Kurve – der Punkt, an dem
 * eine Gerade durch den Ursprung die Kurve berührt.
 */
export function laktataequivalentMinimum(ctx: Analysekontext): Schwellenergebnis {
  const { kurve } = ctx
  const le = (x: number) => kurve.f(x) / x
  const x = minimize(le, kurve.xMin, kurve.xMax)
  const laktat = kurve.f(x)
  const warnungen: Warnung[] = []
  if (amRand(kurve, x)) warnungen.push(randWarnung('Das Laktatäquivalent-Minimum'))
  if (laktat <= 0) {
    return ergebnis('le-minimum', 'le-minimum', ctx, {
      wert: null,
      laktat: null,
      warnungen: [
        ...warnungen,
        {
          code: 'KURVE_NEGATIV',
          schwere: 'warnung',
          nachricht: 'Die Kurve liegt am Laktatäquivalent-Minimum nicht über 0 mmol/L; anderes Kurvenmodell wählen.',
        },
      ],
    })
  }
  return ergebnis('le-minimum', 'le-minimum', ctx, {
    wert: x,
    laktat,
    warnungen,
    details: { laktataequivalent: laktat / x },
  })
}

export interface DickhuthOptionen {
  /** Aufschlag auf das Laktat am LE-Minimum in mmol/L. */
  readonly zuschlag?: number
}

/** Individuelle anaerobe Schwelle nach Dickhuth: Laktat am LE-Minimum + 1,5 mmol/L. */
export function dickhuthIas(ctx: Analysekontext, optionen: DickhuthOptionen = {}): Schwellenergebnis {
  const zuschlag = optionen.zuschlag ?? 1.5
  const le = laktataequivalentMinimum(ctx)
  if (le.wert === null || le.laktat === null) {
    return ergebnis('dickhuth-ias', 'dickhuth-ias', ctx, {
      wert: null,
      laktat: null,
      warnungen: le.warnungen,
      details: { zuschlag },
    })
  }
  const ziel = le.laktat + zuschlag
  const details = { leMinimum: le.wert, leLaktat: le.laktat, zuschlag }
  const x = ersteKreuzung(ctx.kurve, ziel, le.wert)
  if (x === null) {
    return ergebnis('dickhuth-ias', 'dickhuth-ias', ctx, {
      wert: null,
      laktat: null,
      warnungen: [
        ...le.warnungen,
        {
          code: 'ZIEL_NICHT_ERREICHT',
          schwere: 'warnung',
          nachricht: `LE-Minimum + ${fmt(zuschlag)} mmol/L (${fmt(ziel, 2)} mmol/L) wurde im Test nicht erreicht.`,
        },
      ],
      details,
    })
  }
  return ergebnis('dickhuth-ias', 'dickhuth-ias', ctx, { wert: x, laktat: ziel, warnungen: le.warnungen, details })
}
