import { bisect, linearFit, minimize } from './numerik.ts'
import type { Kurve, Stufe } from './typen.ts'

/** Rasterschritte, mit denen Kreuzungen gesucht werden, bevor bisektiert wird. */
const RASTER = 4000

/** Tiefster Punkt der Kurve im Messbereich. */
export function kurvenMinimum(kurve: Kurve): { x: number; laktat: number } {
  const x = minimize(kurve.f, kurve.xMin, kurve.xMax)
  return { x, laktat: kurve.f(x) }
}

/**
 * Erste Intensität ab `ab`, an der die Kurve `ziel` von unten erreicht; `null`, wenn sie es
 * im Messbereich nicht tut. Gesucht wird ab dem Kurvenminimum bzw. einem Modellpunkt, damit
 * ein nach dem Einfahren erhöhtes Laktat auf der ersten Stufe nicht als Schwelle zählt.
 */
export function ersteKreuzung(kurve: Kurve, ziel: number, ab: number = kurve.xMin): number | null {
  const g = (x: number) => kurve.f(x) - ziel
  const h = (kurve.xMax - ab) / RASTER
  if (!(h > 0)) return null
  const g0 = g(ab)
  if (g0 >= 0) return g0 === 0 ? ab : null
  let x0 = ab
  for (let i = 1; i <= RASTER; i++) {
    const x1 = i === RASTER ? kurve.xMax : ab + i * h
    const g1 = g(x1)
    if (g1 >= 0) return g1 === 0 ? x1 : bisect(g, x0, x1)
    x0 = x1
  }
  return null
}

/** Liegt `x` am Rand des Messbereichs (innerhalb 1 % der Spanne)? */
export function amRand(kurve: Kurve, x: number): boolean {
  const toleranz = (kurve.xMax - kurve.xMin) * 0.01
  return x - kurve.xMin <= toleranz || kurve.xMax - x <= toleranz
}

/**
 * Herzfrequenz bei Intensität `x`: linear zwischen den Stufen interpoliert. Außerhalb der
 * Stufen wird vom Randpunkt aus mit der Steigung der Regressionsgeraden über alle Stufen
 * fortgesetzt (stetig, und robuster als die Steigung nur der letzten zwei Stufen).
 */
export function hfBei(stufen: readonly Stufe[], x: number): { hf: number; extrapoliert: boolean } | null {
  const punkte = stufen.flatMap((s) => (s.hf === undefined ? [] : [{ x: s.intensitaet, hf: s.hf }]))
  if (punkte.length < 2) return null
  const erster = punkte[0]
  const letzter = punkte[punkte.length - 1]
  if (erster === undefined || letzter === undefined) return null
  if (x < erster.x || x > letzter.x) {
    const { b } = linearFit(
      punkte.map((p) => p.x),
      punkte.map((p) => p.hf),
    )
    const anker = x < erster.x ? erster : letzter
    return { hf: anker.hf + b * (x - anker.x), extrapoliert: true }
  }
  for (let i = 0; i < punkte.length - 1; i++) {
    const a = punkte[i]
    const b = punkte[i + 1]
    if (a === undefined || b === undefined) break
    if (x <= b.x) {
      return { hf: a.hf + ((b.hf - a.hf) * (x - a.x)) / (b.x - a.x), extrapoliert: false }
    }
  }
  return { hf: letzter.hf, extrapoliert: false }
}
