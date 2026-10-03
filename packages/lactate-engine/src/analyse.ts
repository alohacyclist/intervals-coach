import { passeKurveAn, tasteKurveAb } from './kurven.ts'
import type { BasislinienOptionen } from './modelle/basislinie.ts'
import { basisliniePlus } from './modelle/basislinie.ts'
import type { DmaxOptionen, ModDmaxOptionen } from './modelle/dmax.ts'
import { dmax, modDmax } from './modelle/dmax.ts'
import { schwelle2mmol, schwelle4mmol } from './modelle/fest.ts'
import type { DickhuthOptionen } from './modelle/laktataequivalent.ts'
import { dickhuthIas, laktataequivalentMinimum } from './modelle/laktataequivalent.ts'
import { logLog } from './modelle/loglog.ts'
import type { Pruefoptionen } from './protokoll.ts'
import { findeAuffaelligkeiten, pruefeProtokoll } from './protokoll.ts'
import type {
  Analysekontext,
  Einheit,
  Kurventyp,
  Schwellenergebnis,
  Sportart,
  Stufenprotokoll,
  Warnung,
} from './typen.ts'
import { ENGINE_VERSION } from './versionen.ts'

export interface Analyseoptionen {
  readonly kurve?: Kurventyp
  readonly pruefung?: Pruefoptionen
  readonly basislinie?: BasislinienOptionen
  readonly dickhuth?: DickhuthOptionen
  readonly dmax?: DmaxOptionen
  readonly modDmax?: ModDmaxOptionen
}

/** Schlüssel der Standardschwellen in `Analyse.schwellen`. */
export type SchwellenSchluessel =
  | 'fest-2'
  | 'fest-4'
  | 'basislinie-plus'
  | 'le-minimum'
  | 'dickhuth-ias'
  | 'dmax'
  | 'mod-dmax'
  | 'log-log'

/** Welche Schwelle ein Modell üblicherweise beschreibt – Vorbelegung für die Modellwahl. */
export const MODELLROLLE: Readonly<Record<SchwellenSchluessel, 'LT1' | 'LT2'>> = {
  'fest-2': 'LT1',
  'fest-4': 'LT2',
  'basislinie-plus': 'LT1',
  'le-minimum': 'LT1',
  'dickhuth-ias': 'LT2',
  dmax: 'LT2',
  'mod-dmax': 'LT2',
  'log-log': 'LT1',
}

export const MODELLNAME: Readonly<Record<SchwellenSchluessel, string>> = {
  'fest-2': '2 mmol/L',
  'fest-4': '4 mmol/L (OBLA)',
  'basislinie-plus': 'Basislinie + 1,0 mmol/L',
  'le-minimum': 'Laktatäquivalent-Minimum',
  'dickhuth-ias': 'IAS nach Dickhuth',
  dmax: 'Dmax',
  'mod-dmax': 'Modifiziertes Dmax',
  'log-log': 'Log-Log-Breakpoint',
}

/** Serialisierbares Gesamtergebnis eines Tests, so wie es gespeichert wird. */
export interface Analyse {
  readonly engineVersion: string
  readonly sportart: Sportart
  readonly einheit: Einheit
  readonly kurve: {
    readonly typ: Kurventyp
    readonly version: number
    readonly parameter: Readonly<Record<string, number>>
    readonly r2: number
    readonly rmse: number
    readonly residuen: readonly number[]
    readonly punkte: readonly { readonly x: number; readonly laktat: number }[]
  }
  readonly schwellen: Readonly<Record<SchwellenSchluessel, Schwellenergebnis>>
  /** Hinweise zu Protokoll und Kurve; modellbezogene Hinweise stehen an der jeweiligen Schwelle. */
  readonly warnungen: readonly Warnung[]
}

/** Wertet ein Stufenprotokoll mit allen Schwellenmodellen auf einer Kurve aus. */
export function analysiere(protokoll: Stufenprotokoll, optionen: Analyseoptionen = {}): Analyse {
  const geprueft = pruefeProtokoll(protokoll)
  const kurve = passeKurveAn(geprueft, optionen.kurve)
  const ctx: Analysekontext = { protokoll: geprueft, kurve }
  const schwellen: Record<SchwellenSchluessel, Schwellenergebnis> = {
    'fest-2': schwelle2mmol(ctx),
    'fest-4': schwelle4mmol(ctx),
    'basislinie-plus': basisliniePlus(ctx, optionen.basislinie),
    'le-minimum': laktataequivalentMinimum(ctx),
    'dickhuth-ias': dickhuthIas(ctx, optionen.dickhuth),
    dmax: dmax(ctx, optionen.dmax),
    'mod-dmax': modDmax(ctx, optionen.modDmax),
    'log-log': logLog(ctx),
  }
  return {
    engineVersion: ENGINE_VERSION,
    sportart: geprueft.sportart,
    einheit: geprueft.einheit,
    kurve: {
      typ: kurve.typ,
      version: kurve.version,
      parameter: kurve.parameter,
      r2: kurve.r2,
      rmse: kurve.rmse,
      residuen: kurve.residuen,
      punkte: tasteKurveAb(kurve),
    },
    schwellen,
    warnungen: [...findeAuffaelligkeiten(geprueft, optionen.pruefung), ...kurve.warnungen],
  }
}
