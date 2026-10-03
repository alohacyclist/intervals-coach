/**
 * Öffentliche Typen der Laktat-Engine.
 *
 * Fachbegriffe sind deutsch (Stufe, Laktat, Schwelle), weil Coaches und Diagnostiker sie
 * so lesen; rein mathematische Hilfen in `numerik.ts` bleiben englisch.
 */

export type Sportart = 'rad' | 'lauf'

/** Watt für Ergometer, km/h für Laufband und Bahn. */
export type Einheit = 'watt' | 'kmh'

export interface Stufe {
  /** Leistung in Watt oder Geschwindigkeit in km/h, je nach `einheit` des Protokolls. */
  readonly intensitaet: number
  /** Laktat in mmol/L, am Ende der Stufe abgenommen. */
  readonly laktat: number
  /** Herzfrequenz am Ende der Stufe (1/min). */
  readonly hf?: number
  /** Subjektives Belastungsempfinden, Skala frei (Borg 6–20 oder CR10). */
  readonly rpe?: number
  /** Stufendauer in Sekunden. */
  readonly dauerSek?: number
}

export interface Stufenprotokoll {
  readonly sportart: Sportart
  /** Ohne Angabe: Watt für Rad, km/h für Lauf. */
  readonly einheit?: Einheit
  /** In Testreihenfolge, Intensität streng steigend. */
  readonly stufen: readonly Stufe[]
  /** Ruhelaktat vor dem Test in mmol/L. */
  readonly ruhelaktat?: number
}

/** Ein Protokoll, dessen Pflichtangaben geprüft und dessen Einheit aufgelöst ist. */
export interface GeprueftesProtokoll {
  readonly sportart: Sportart
  readonly einheit: Einheit
  readonly stufen: readonly Stufe[]
  readonly ruhelaktat: number | null
}

export type Schwere = 'info' | 'warnung'

export type WarnungCode =
  // Protokoll und Messwerte
  | 'WENIGE_STUFEN'
  | 'LAKTATABFALL'
  | 'HF_ABFALL'
  | 'LAKTAT_UNPLAUSIBEL'
  | 'HF_UNPLAUSIBEL'
  | 'RUHELAKTAT_HOCH'
  | 'STUFENDAUER_KURZ'
  | 'STUFENDAUER_UNEINHEITLICH'
  | 'MAXIMALLAKTAT_NIEDRIG'
  // Kurvenanpassung
  | 'ANPASSUNG_SCHWACH'
  | 'RESIDUUM_GROSS'
  | 'KURVE_FAELLT_AM_ENDE'
  | 'KURVE_NEGATIV'
  | 'SPLINE_GEGLAETTET'
  | 'EXPONENTIAL_GRENZWERT'
  // Schwellenmodelle
  | 'ZIEL_UNTER_KURVENMINIMUM'
  | 'ZIEL_NICHT_ERREICHT'
  | 'RUHELAKTAT_FEHLT'
  | 'AM_RAND_DES_MESSBEREICHS'
  | 'KEIN_DMAX'
  | 'KEIN_ANSTIEG'
  | 'KEIN_KNICK'
  | 'KEINE_HF'

export interface Warnung {
  readonly code: WarnungCode
  readonly schwere: Schwere
  /** Für Coaches formuliert, beschreibt Messung und Auswertung, nie einen Befund. */
  readonly nachricht: string
  /** 0-basierter Index der betroffenen Stufe, falls die Warnung an einer Stufe hängt. */
  readonly stufenIndex?: number
}

export type Kurventyp = 'polynom3' | 'exponential' | 'monotoner-spline'

export interface Kurve {
  readonly typ: Kurventyp
  readonly version: number
  /** Kleinste und größte gemessene Intensität; Schwellen werden nur dazwischen gesucht. */
  readonly xMin: number
  readonly xMax: number
  /** Laktat in mmol/L an der Intensität `x`. */
  readonly f: (x: number) => number
  /** Kurvenparameter in den Einheiten des Protokolls, zur Anzeige und Nachvollziehbarkeit. */
  readonly parameter: Readonly<Record<string, number>>
  readonly r2: number
  /** Wurzel des mittleren quadratischen Fehlers in mmol/L. */
  readonly rmse: number
  /** Messwert minus Kurvenwert, je Stufe. */
  readonly residuen: readonly number[]
  readonly warnungen: readonly Warnung[]
}

export type ModellId =
  | `fest-${number}`
  | 'basislinie-plus'
  | 'le-minimum'
  | 'dickhuth-ias'
  | 'dmax'
  | 'mod-dmax'
  | 'log-log'

/** Schlüssel, unter dem ein Modell versioniert wird; alle festen Schwellen teilen sich `fest`. */
export type ModellFamilie =
  | 'fest'
  | 'basislinie-plus'
  | 'le-minimum'
  | 'dickhuth-ias'
  | 'dmax'
  | 'mod-dmax'
  | 'log-log'

export interface Schwellenergebnis {
  readonly modell: ModellId
  readonly modellVersion: number
  /** Kurve, auf der die Schwelle bestimmt wurde; `null` für Modelle, die direkt auf den Messwerten rechnen. */
  readonly kurve: { readonly typ: Kurventyp; readonly version: number } | null
  readonly einheit: Einheit
  /** Intensität an der Schwelle, `null` wenn das Modell im Messbereich keine Schwelle findet. */
  readonly wert: number | null
  /** Herzfrequenz an der Schwelle, interpoliert aus den Stufen; `null` ohne HF-Daten. */
  readonly hf: number | null
  /** Laktat an der Schwelle in mmol/L. */
  readonly laktat: number | null
  readonly warnungen: readonly Warnung[]
  /** Modellspezifische Zwischenwerte (Basislinie, Steigungen, Abstand …). */
  readonly details: Readonly<Record<string, number | string>>
}

/** Alles, was ein kurvenbasiertes Schwellenmodell braucht. */
export interface Analysekontext {
  readonly protokoll: GeprueftesProtokoll
  readonly kurve: Kurve
}
