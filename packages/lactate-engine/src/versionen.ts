import type { Kurventyp, ModellFamilie } from './typen.ts'

/**
 * Versionen, die mit jedem Testergebnis gespeichert werden.
 *
 * Regel: Jede Änderung, die die Ausgabe eines Modells verändert, erhöht dessen Version –
 * auch wenn sie aus einer gemeinsamen Hilfsfunktion (Kurvensuche, HF-Interpolation) kommt.
 * Der Golden-Test schlägt fehl, solange sich Werte ändern, ohne dass die Version steigt.
 */
export const ENGINE_VERSION = '0.1.0'

export const MODELL_VERSIONEN: Readonly<Record<ModellFamilie, number>> = {
  fest: 1,
  'basislinie-plus': 1,
  'le-minimum': 1,
  'dickhuth-ias': 1,
  dmax: 1,
  'mod-dmax': 1,
  'log-log': 1,
}

export const KURVEN_VERSIONEN: Readonly<Record<Kurventyp, number>> = {
  polynom3: 1,
  exponential: 1,
  'monotoner-spline': 1,
}
