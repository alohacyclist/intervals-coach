import { ersteKreuzung, kurvenMinimum } from '../suche.ts'
import type { Analysekontext, Schwellenergebnis, Warnung } from '../typen.ts'
import { ergebnis, fmt } from './gemeinsam.ts'

/**
 * Woran die Basislinie gemessen wird:
 * - `messminimum`: niedrigster gemessener Laktatwert im Test (Standard)
 * - `kurvenminimum`: tiefster Punkt der angepassten Kurve
 * - `ruhelaktat`: Ruhewert vor dem Test; fehlt er, gilt das Messminimum
 */
export type Basislinie = 'messminimum' | 'kurvenminimum' | 'ruhelaktat'

export interface BasislinienOptionen {
  readonly basislinie?: Basislinie
  /** Aufschlag auf die Basislinie in mmol/L. */
  readonly zuschlag?: number
}

/** Basislinie + 1,0 mmol/L (LT1). Basislinie und Aufschlag sind einstellbar. */
export function basisliniePlus(ctx: Analysekontext, optionen: BasislinienOptionen = {}): Schwellenergebnis {
  const zuschlag = optionen.zuschlag ?? 1.0
  let art = optionen.basislinie ?? 'messminimum'
  const warnungen: Warnung[] = []
  const min = kurvenMinimum(ctx.kurve)
  const messminimum = Math.min(...ctx.protokoll.stufen.map((s) => s.laktat))

  if (art === 'ruhelaktat' && ctx.protokoll.ruhelaktat === null) {
    warnungen.push({
      code: 'RUHELAKTAT_FEHLT',
      schwere: 'warnung',
      nachricht: 'Kein Ruhelaktat erfasst; als Basislinie dient der niedrigste Messwert im Test.',
    })
    art = 'messminimum'
  }
  const basis =
    art === 'ruhelaktat' && ctx.protokoll.ruhelaktat !== null
      ? ctx.protokoll.ruhelaktat
      : art === 'kurvenminimum'
        ? min.laktat
        : messminimum
  const ziel = basis + zuschlag
  const details = { basislinie: basis, basislinienArt: art, zuschlag }
  const x = ersteKreuzung(ctx.kurve, ziel, min.x)
  if (x === null) {
    const unter = min.laktat >= ziel
    warnungen.push({
      code: unter ? 'ZIEL_UNTER_KURVENMINIMUM' : 'ZIEL_NICHT_ERREICHT',
      schwere: 'warnung',
      nachricht: unter
        ? `Die Kurve liegt im ganzen Messbereich über Basislinie + ${fmt(zuschlag)} mmol/L (${fmt(ziel, 2)} mmol/L).`
        : `Basislinie + ${fmt(zuschlag)} mmol/L (${fmt(ziel, 2)} mmol/L) wurde im Test nicht erreicht.`,
    })
    return ergebnis('basislinie-plus', 'basislinie-plus', ctx, { wert: null, laktat: null, warnungen, details })
  }
  return ergebnis('basislinie-plus', 'basislinie-plus', ctx, { wert: x, laktat: ziel, warnungen, details })
}
