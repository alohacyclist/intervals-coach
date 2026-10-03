import { hfBei } from '../suche.ts'
import type { Analysekontext, Einheit, ModellFamilie, ModellId, Schwellenergebnis, Warnung } from '../typen.ts'
import { MODELL_VERSIONEN } from '../versionen.ts'

export function fmt(x: number, stellen = 1): string {
  return x.toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: 0 })
}

export function fmtIntensitaet(x: number, einheit: Einheit): string {
  return einheit === 'watt' ? `${fmt(x, 0)} W` : `${fmt(x, 1)} km/h`
}

interface Rohergebnis {
  readonly wert: number | null
  readonly laktat: number | null
  readonly warnungen?: readonly Warnung[]
  readonly details?: Readonly<Record<string, number | string>>
}

/**
 * Baut das Ergebnis eines Modells: Version, Kurve und Herzfrequenz kommen für alle Modelle
 * auf demselben Weg dazu.
 */
export function ergebnis(
  modell: ModellId,
  familie: ModellFamilie,
  ctx: Analysekontext,
  roh: Rohergebnis,
  aufKurve = true,
): Schwellenergebnis {
  const warnungen = [...(roh.warnungen ?? [])]
  let hf: number | null = null
  if (roh.wert !== null) {
    const h = hfBei(ctx.protokoll.stufen, roh.wert)
    if (h === null) {
      if (ctx.protokoll.stufen.some((s) => s.hf !== undefined)) {
        warnungen.push({
          code: 'KEINE_HF',
          schwere: 'info',
          nachricht: 'Zu wenige Herzfrequenzwerte, um die HF an der Schwelle zu bestimmen.',
        })
      }
    } else {
      hf = h.hf
    }
  }
  return {
    modell,
    modellVersion: MODELL_VERSIONEN[familie],
    kurve: aufKurve ? { typ: ctx.kurve.typ, version: ctx.kurve.version } : null,
    einheit: ctx.protokoll.einheit,
    wert: roh.wert,
    hf,
    laktat: roh.laktat,
    warnungen,
    details: roh.details ?? {},
  }
}

export function randWarnung(modellName: string): Warnung {
  return {
    code: 'AM_RAND_DES_MESSBEREICHS',
    schwere: 'warnung',
    nachricht: `${modellName} liegt am Rand des Messbereichs; der Wert ist dort wenig belastbar.`,
  }
}
