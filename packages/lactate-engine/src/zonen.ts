import { hfBei } from './suche.ts'
import type { Einheit, Stufe } from './typen.ts'

/**
 * Eine Zonengrenze, ausgedrückt relativ zu den Schwellen:
 * - `{ anker: 'LT1', faktor: 0.8 }` → 80 % der Intensität an LT1
 * - `{ anker: 'LT1-LT2', anteil: 0.5 }` → Mitte zwischen LT1 und LT2
 */
export type Grenze =
  | { readonly anker: 'LT1' | 'LT2'; readonly faktor: number }
  | { readonly anker: 'LT1-LT2'; readonly anteil: number }

export interface Zone {
  readonly id: string
  readonly kurz: string
  readonly name: string
}

/**
 * Ein Zonenmodell: `zonen.length` Zonen, getrennt durch `grenzen.length = zonen.length − 1`
 * aufsteigende Grenzen. Die unterste Zone beginnt bei 0, die oberste ist nach oben offen.
 */
export interface Zonenmodell {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly zonen: readonly Zone[]
  readonly grenzen: readonly Grenze[]
}

export interface Schwellenpaar {
  /** Intensität an LT1 (aerobe Schwelle) in der Einheit des Protokolls. */
  readonly lt1: number
  /** Intensität an LT2 (anaerobe Schwelle) in der Einheit des Protokolls. */
  readonly lt2: number
}

/** Ein Bereich; `null` heißt offen (unterste Zone nach unten, oberste nach oben). */
export interface Bereich {
  readonly von: number | null
  readonly bis: number | null
}

export interface Zonenzeile {
  readonly zone: Zone
  /** Leistung in W bzw. Geschwindigkeit in km/h. */
  readonly intensitaet: Bereich
  /** Nur bei km/h: Pace in Sekunden pro km; `von` ist die langsamere Grenze. */
  readonly pace: Bereich | null
  /** Herzfrequenz, aus den Stufen interpoliert; `null` ohne HF-Daten. */
  readonly hf: Bereich | null
}

export interface Zonenergebnis {
  readonly modell: string
  readonly modellVersion: number
  readonly einheit: Einheit
  readonly lt1: number
  readonly lt2: number
  readonly zeilen: readonly Zonenzeile[]
  /** HF-Grenzen außerhalb der gemessenen Stufen sind fortgeschrieben, nicht gemessen. */
  readonly hfExtrapoliert: boolean
}

export class ZonenFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht)
    this.name = 'ZonenFehler'
  }
}

/**
 * Vorlagen. Die Grenzen der 5- und 7-Zonen-Modelle sind Vorschläge und müssen fachlich
 * bestätigt werden; jede Änderung an einer Vorlage erhöht ihre Version.
 */
export const DREI_ZONEN: Zonenmodell = {
  id: 'drei-zonen',
  name: '3 Zonen (LT1/LT2)',
  version: 1,
  zonen: [
    { id: 'z1', kurz: 'Z1', name: 'Unter LT1' },
    { id: 'z2', kurz: 'Z2', name: 'Zwischen LT1 und LT2' },
    { id: 'z3', kurz: 'Z3', name: 'Über LT2' },
  ],
  grenzen: [
    { anker: 'LT1', faktor: 1 },
    { anker: 'LT2', faktor: 1 },
  ],
}

export const FUENF_ZONEN: Zonenmodell = {
  id: 'fuenf-zonen',
  name: '5 Zonen',
  version: 1,
  zonen: [
    { id: 'z1', kurz: 'REKOM', name: 'Regeneration' },
    { id: 'z2', kurz: 'GA1', name: 'Grundlage 1' },
    { id: 'z3', kurz: 'GA2', name: 'Grundlage 2' },
    { id: 'z4', kurz: 'EB', name: 'Schwellenbereich' },
    { id: 'z5', kurz: 'SB', name: 'Über der Schwelle' },
  ],
  grenzen: [
    { anker: 'LT1', faktor: 0.8 },
    { anker: 'LT1', faktor: 1 },
    { anker: 'LT2', faktor: 0.95 },
    { anker: 'LT2', faktor: 1.05 },
  ],
}

export const SIEBEN_ZONEN: Zonenmodell = {
  id: 'sieben-zonen',
  name: '7 Zonen',
  version: 1,
  zonen: [
    { id: 'z1', kurz: 'Z1', name: 'Regeneration' },
    { id: 'z2', kurz: 'Z2', name: 'Grundlage' },
    { id: 'z3', kurz: 'Z3', name: 'Tempo' },
    { id: 'z4', kurz: 'Z4', name: 'Unter der Schwelle' },
    { id: 'z5', kurz: 'Z5', name: 'Schwelle' },
    { id: 'z6', kurz: 'Z6', name: 'VO2max' },
    { id: 'z7', kurz: 'Z7', name: 'Anaerob' },
  ],
  grenzen: [
    { anker: 'LT1', faktor: 0.8 },
    { anker: 'LT1', faktor: 1 },
    { anker: 'LT1-LT2', anteil: 0.5 },
    { anker: 'LT2', faktor: 0.95 },
    { anker: 'LT2', faktor: 1.05 },
    { anker: 'LT2', faktor: 1.2 },
  ],
}

export const ZONENMODELLE: readonly Zonenmodell[] = [DREI_ZONEN, FUENF_ZONEN, SIEBEN_ZONEN]

export function grenzwert(grenze: Grenze, { lt1, lt2 }: Schwellenpaar): number {
  switch (grenze.anker) {
    case 'LT1':
      return lt1 * grenze.faktor
    case 'LT2':
      return lt2 * grenze.faktor
    case 'LT1-LT2':
      return lt1 + grenze.anteil * (lt2 - lt1)
  }
}

/** Auf die Genauigkeit gerundet, mit der Coaches Zonen vorgeben. */
function rundeIntensitaet(x: number, einheit: Einheit): number {
  return einheit === 'watt' ? Math.round(x) : Math.round(x * 10) / 10
}

/** Pace in s/km aus km/h, auf ganze Sekunden. */
export function paceAusKmh(kmh: number): number {
  return Math.round(3600 / kmh)
}

export interface ZonenOptionen {
  readonly einheit: Einheit
  /** Stufen mit HF; ohne sie gibt es keine HF-Zonen. */
  readonly stufen?: readonly Stufe[]
}

/**
 * Zonen für Leistung bzw. Geschwindigkeit, Pace und Herzfrequenz aus LT1 und LT2.
 * HF-Grenzen werden an den Intensitätsgrenzen aus den Stufen interpoliert, nicht
 * prozentual aus der Schwellen-HF – so passen beide Skalen zum selben Test.
 */
export function berechneZonen(modell: Zonenmodell, schwellen: Schwellenpaar, optionen: ZonenOptionen): Zonenergebnis {
  const { lt1, lt2 } = schwellen
  const { einheit } = optionen
  if (modell.grenzen.length !== modell.zonen.length - 1) {
    throw new ZonenFehler(`Zonenmodell ${modell.id}: ${modell.zonen.length} Zonen brauchen ${modell.zonen.length - 1} Grenzen.`)
  }
  if (!(lt1 > 0 && lt2 > lt1)) {
    throw new ZonenFehler('LT1 muss positiv sein und unter LT2 liegen.')
  }
  const grenzen = modell.grenzen.map((g) => grenzwert(g, schwellen))
  grenzen.forEach((g, i) => {
    const vorher = grenzen[i - 1]
    if (!(g > 0) || (vorher !== undefined && !(g > vorher))) {
      throw new ZonenFehler(
        `Zonenmodell ${modell.id}: die Grenzen steigen mit LT1 = ${lt1} und LT2 = ${lt2} nicht an (Grenze ${i + 1}). LT1 und LT2 liegen dafür zu nah beieinander.`,
      )
    }
  })

  const stufen = optionen.stufen ?? []
  const hatHf = stufen.filter((s) => s.hf !== undefined).length >= 2
  let hfExtrapoliert = false
  const hfGrenzen = grenzen.map((g) => {
    const h = hatHf ? hfBei(stufen, g) : null
    if (h?.extrapoliert) hfExtrapoliert = true
    return h === null ? null : Math.round(h.hf)
  })

  const zeilen = modell.zonen.map((zone, i): Zonenzeile => {
    const von = i === 0 ? null : (grenzen[i - 1] ?? null)
    const bis = grenzen[i] ?? null
    const intensitaet = {
      von: von === null ? null : rundeIntensitaet(von, einheit),
      bis: bis === null ? null : rundeIntensitaet(bis, einheit),
    }
    const pace =
      einheit === 'kmh'
        ? {
            von: intensitaet.von === null ? null : paceAusKmh(intensitaet.von),
            bis: intensitaet.bis === null ? null : paceAusKmh(intensitaet.bis),
          }
        : null
    const hf = hatHf ? { von: i === 0 ? null : (hfGrenzen[i - 1] ?? null), bis: hfGrenzen[i] ?? null } : null
    return { zone, intensitaet, pace, hf }
  })

  return {
    modell: modell.id,
    modellVersion: modell.version,
    einheit,
    lt1,
    lt2,
    zeilen,
    hfExtrapoliert,
  }
}
