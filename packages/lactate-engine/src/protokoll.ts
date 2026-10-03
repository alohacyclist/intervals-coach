import type { Einheit, GeprueftesProtokoll, Sportart, Stufenprotokoll, Warnung } from './typen.ts'

/** Mindestens so viele Stufen braucht ein Polynom 3. Grades. */
export const MIN_STUFEN = 4

/** Ab hier gilt ein Protokoll nicht mehr als knapp. */
const EMPFOHLENE_STUFEN = 6

export class ProtokollFehler extends Error {
  readonly fehler: readonly string[]

  constructor(fehler: readonly string[]) {
    super(`Das Stufenprotokoll lässt sich nicht auswerten: ${fehler.join(' ')}`)
    this.name = 'ProtokollFehler'
    this.fehler = fehler
  }
}

export interface Pruefoptionen {
  /** Laktatabfall zwischen zwei Stufen, ab dem gewarnt wird (mmol/L). */
  readonly laktatAbfall?: number
  /** HF-Abfall zwischen zwei Stufen, ab dem gewarnt wird (1/min). */
  readonly hfAbfall?: number
  /** Stufen kürzer als das gelten als kurz für ein Laktat-Steady-State (Sekunden). */
  readonly minStufendauerSek?: number
}

export const STANDARD_PRUEFOPTIONEN: Required<Pruefoptionen> = {
  laktatAbfall: 0.5,
  hfAbfall: 5,
  minStufendauerSek: 180,
}

const STANDARD_EINHEIT: Readonly<Record<Sportart, Einheit>> = { rad: 'watt', lauf: 'kmh' }

export function einheitLabel(einheit: Einheit): string {
  return einheit === 'watt' ? 'W' : 'km/h'
}

function fmt(x: number, stellen = 1): string {
  return x.toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: 0 })
}

/**
 * Prüft die harten Voraussetzungen einer Auswertung und löst die Einheit auf.
 * Wirft `ProtokollFehler`, wenn das Protokoll nicht auswertbar ist.
 */
export function pruefeProtokoll(protokoll: Stufenprotokoll): GeprueftesProtokoll {
  const fehler: string[] = []
  const { stufen } = protokoll
  if (stufen.length < MIN_STUFEN) {
    fehler.push(`Es braucht mindestens ${MIN_STUFEN} Stufen, erfasst sind ${stufen.length}.`)
  }
  stufen.forEach((s, i) => {
    const nr = i + 1
    if (!Number.isFinite(s.intensitaet) || s.intensitaet <= 0) {
      fehler.push(`Stufe ${nr}: Intensität muss eine positive Zahl sein.`)
    }
    if (!Number.isFinite(s.laktat) || s.laktat <= 0) {
      fehler.push(`Stufe ${nr}: Laktat muss eine positive Zahl sein.`)
    }
    if (s.hf !== undefined && (!Number.isFinite(s.hf) || s.hf <= 0)) {
      fehler.push(`Stufe ${nr}: Herzfrequenz muss eine positive Zahl sein.`)
    }
    if (s.dauerSek !== undefined && (!Number.isFinite(s.dauerSek) || s.dauerSek <= 0)) {
      fehler.push(`Stufe ${nr}: Stufendauer muss eine positive Zahl sein.`)
    }
    const vorher = stufen[i - 1]
    if (vorher !== undefined && !(s.intensitaet > vorher.intensitaet)) {
      fehler.push(`Stufe ${nr}: Intensität muss höher sein als in Stufe ${i}.`)
    }
  })
  if (protokoll.ruhelaktat !== undefined && (!Number.isFinite(protokoll.ruhelaktat) || protokoll.ruhelaktat <= 0)) {
    fehler.push('Ruhelaktat muss eine positive Zahl sein.')
  }
  if (fehler.length > 0) throw new ProtokollFehler(fehler)
  return {
    sportart: protokoll.sportart,
    einheit: protokoll.einheit ?? STANDARD_EINHEIT[protokoll.sportart],
    stufen: protokoll.stufen,
    ruhelaktat: protokoll.ruhelaktat ?? null,
  }
}

/**
 * Hinweise auf Messfehler und Auffälligkeiten im Protokoll. Ändert nichts an den Daten:
 * ob eine Stufe als Ausreißer gilt, entscheidet der Coach.
 */
export function findeAuffaelligkeiten(protokoll: GeprueftesProtokoll, optionen: Pruefoptionen = {}): Warnung[] {
  const opt = { ...STANDARD_PRUEFOPTIONEN, ...optionen }
  const warnungen: Warnung[] = []
  const { stufen } = protokoll

  if (stufen.length < EMPFOHLENE_STUFEN) {
    warnungen.push({
      code: 'WENIGE_STUFEN',
      schwere: 'warnung',
      nachricht: `Nur ${stufen.length} Stufen: die Kurve hängt stark an einzelnen Messwerten, Schwellen sind entsprechend unsicher.`,
    })
  }

  stufen.forEach((s, i) => {
    const nr = i + 1
    if (s.laktat < 0.3 || s.laktat > 25) {
      warnungen.push({
        code: 'LAKTAT_UNPLAUSIBEL',
        schwere: 'warnung',
        nachricht: `Stufe ${nr}: ${fmt(s.laktat)} mmol/L liegt außerhalb des üblichen Messbereichs – bitte Eingabe und Probe prüfen.`,
        stufenIndex: i,
      })
    }
    if (s.hf !== undefined && (s.hf < 40 || s.hf > 230)) {
      warnungen.push({
        code: 'HF_UNPLAUSIBEL',
        schwere: 'warnung',
        nachricht: `Stufe ${nr}: Herzfrequenz ${fmt(s.hf, 0)} wirkt unplausibel – bitte Eingabe prüfen.`,
        stufenIndex: i,
      })
    }
    const vorher = stufen[i - 1]
    if (vorher === undefined) return
    const abfall = vorher.laktat - s.laktat
    if (abfall > opt.laktatAbfall) {
      warnungen.push({
        code: 'LAKTATABFALL',
        schwere: 'warnung',
        nachricht: `Stufe ${nr}: Laktat fällt um ${fmt(abfall)} mmol/L trotz höherer Last – möglicher Mess- oder Abnahmefehler.`,
        stufenIndex: i,
      })
    }
    if (s.hf !== undefined && vorher.hf !== undefined && vorher.hf - s.hf > opt.hfAbfall) {
      warnungen.push({
        code: 'HF_ABFALL',
        schwere: 'warnung',
        nachricht: `Stufe ${nr}: Herzfrequenz fällt um ${fmt(vorher.hf - s.hf, 0)} Schläge trotz höherer Last – Sensor prüfen.`,
        stufenIndex: i,
      })
    }
  })

  if (protokoll.ruhelaktat !== null && protokoll.ruhelaktat > 2.5) {
    warnungen.push({
      code: 'RUHELAKTAT_HOCH',
      schwere: 'info',
      nachricht: `Ruhelaktat ${fmt(protokoll.ruhelaktat)} mmol/L ist erhöht (Vorbelastung, Ernährung, Abnahme?). Basislinienmodelle können dadurch verschoben sein.`,
    })
  }

  // Die letzte Stufe darf wegen Abbruch kürzer sein.
  const ohneLetzte = stufen.slice(0, -1).map((s) => s.dauerSek).filter((d): d is number => d !== undefined)
  if (ohneLetzte.some((d) => d < opt.minStufendauerSek)) {
    warnungen.push({
      code: 'STUFENDAUER_KURZ',
      schwere: 'info',
      nachricht: `Stufen unter ${fmt(opt.minStufendauerSek / 60)} min: das Laktat erreicht dann oft kein Gleichgewicht, Schwellen fallen eher zu hoch aus.`,
    })
  }
  if (new Set(ohneLetzte).size > 1) {
    warnungen.push({
      code: 'STUFENDAUER_UNEINHEITLICH',
      schwere: 'info',
      nachricht: 'Die Stufen sind unterschiedlich lang; Vergleiche mit früheren Tests nur bei gleichem Schema.',
    })
  }

  const maxLaktat = Math.max(...stufen.map((s) => s.laktat))
  if (maxLaktat < 4) {
    warnungen.push({
      code: 'MAXIMALLAKTAT_NIEDRIG',
      schwere: 'info',
      nachricht: `Höchstes Laktat ${fmt(maxLaktat)} mmol/L: der Test endete vermutlich vor der Ausbelastung, obere Schwellen lassen sich nicht oder nur unsicher bestimmen.`,
    })
  }

  return warnungen
}
