import { passeKurveAn, pruefeProtokoll } from '../src/index.ts'
import type { Analysekontext, Kurventyp, Stufe, Stufenprotokoll } from '../src/index.ts'

/** Stufen aus einer exakten Funktion – die erwarteten Schwellen sind dann analytisch bekannt. */
export function stufenAus(xs: readonly number[], f: (x: number) => number, hf?: (x: number) => number): Stufe[] {
  return xs.map((x) => ({ intensitaet: x, laktat: f(x), ...(hf ? { hf: hf(x) } : {}) }))
}

export function rad(stufen: readonly Stufe[], extra: Partial<Stufenprotokoll> = {}): Stufenprotokoll {
  return { sportart: 'rad', stufen, ...extra }
}

export function kontext(protokoll: Stufenprotokoll, typ: Kurventyp = 'polynom3'): Analysekontext {
  const geprueft = pruefeProtokoll(protokoll)
  return { protokoll: geprueft, kurve: passeKurveAn(geprueft, typ) }
}

/** Unabhängige Nullstellensuche für Erwartungswerte (nicht die der Engine). */
export function nullstelle(f: (x: number) => number, a: number, b: number): number {
  let lo = a
  let hi = b
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const WATT = [100, 150, 200, 250, 300, 350]
