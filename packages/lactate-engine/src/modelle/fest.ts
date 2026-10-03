import { ersteKreuzung, kurvenMinimum } from '../suche.ts'
import type { Analysekontext, Schwellenergebnis } from '../typen.ts'
import { ergebnis, fmt } from './gemeinsam.ts'

/**
 * Intensität, an der die Kurve einen festen Laktatwert erreicht. Gesucht wird ab dem
 * Kurvenminimum, damit ein erhöhter Startwert nicht als Schwelle zählt.
 */
export function festeSchwelle(ctx: Analysekontext, zielLaktat: number): Schwellenergebnis {
  const { kurve } = ctx
  const modell = `fest-${zielLaktat}` as const
  const min = kurvenMinimum(kurve)
  if (min.laktat >= zielLaktat) {
    return ergebnis(modell, 'fest', ctx, {
      wert: null,
      laktat: null,
      warnungen: [
        {
          code: 'ZIEL_UNTER_KURVENMINIMUM',
          schwere: 'warnung',
          nachricht: `Die Kurve liegt im ganzen Messbereich über ${fmt(zielLaktat)} mmol/L; die ${fmt(zielLaktat)}-mmol-Schwelle liegt unterhalb der ersten Stufe.`,
        },
      ],
      details: { zielLaktat },
    })
  }
  const x = ersteKreuzung(kurve, zielLaktat, min.x)
  if (x === null) {
    return ergebnis(modell, 'fest', ctx, {
      wert: null,
      laktat: null,
      warnungen: [
        {
          code: 'ZIEL_NICHT_ERREICHT',
          schwere: 'warnung',
          nachricht: `${fmt(zielLaktat)} mmol/L wurden im Test nicht erreicht; die Schwelle liegt oberhalb der letzten Stufe.`,
        },
      ],
      details: { zielLaktat },
    })
  }
  return ergebnis(modell, 'fest', ctx, { wert: x, laktat: zielLaktat, details: { zielLaktat } })
}

/** Feste 2-mmol/L-Schwelle. */
export function schwelle2mmol(ctx: Analysekontext): Schwellenergebnis {
  return festeSchwelle(ctx, 2)
}

/** Feste 4-mmol/L-Schwelle (OBLA, Onset of Blood Lactate Accumulation). */
export function schwelle4mmol(ctx: Analysekontext): Schwellenergebnis {
  return festeSchwelle(ctx, 4)
}
