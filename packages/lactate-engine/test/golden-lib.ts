/**
 * Gemeinsame Logik für Golden-Test und `npm run golden:update`.
 *
 * Fixtures (test/fixtures/*.json) sind von Hand gepflegt: Protokoll und optionale
 * Referenzwerte aus WinLactat/Ergonizer. Golden-Dateien (test/golden/*.json) werden
 * erzeugt und halten fest, was die Engine in welcher Modellversion ausgibt.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analysiere } from '../src/index.ts'
import type { Kurventyp, SchwellenSchluessel, Stufenprotokoll } from '../src/index.ts'

export const FIXTURE_DIR = join(import.meta.dirname, 'fixtures')
export const GOLDEN_DIR = join(import.meta.dirname, 'golden')
export const KURVENTYPEN: readonly Kurventyp[] = ['polynom3', 'exponential', 'monotoner-spline']

/** Abweichung, ab der ein Golden-Wert als geändert gilt. */
export const GOLDEN_TOLERANZ = 1e-3

export interface Referenzwert {
  readonly wert?: number
  readonly hf?: number
  readonly laktat?: number
}

export interface Fixture {
  readonly id: string
  readonly beschreibung: string
  readonly protokoll: Stufenprotokoll
  readonly referenz: {
    readonly quelle: string | null
    readonly kurve: Kurventyp
    readonly hinweis?: string
    readonly toleranz: { readonly wert: number; readonly hf: number; readonly laktat: number }
    readonly werte: Partial<Record<SchwellenSchluessel, Referenzwert>>
  }
}

export interface GoldenSchwelle {
  readonly modellVersion: number
  readonly wert: number | null
  readonly hf: number | null
  readonly laktat: number | null
  readonly warnungen: readonly string[]
}

export interface GoldenKurve {
  readonly kurvenVersion: number
  readonly r2: number
  readonly warnungen: readonly string[]
  readonly schwellen: Readonly<Record<string, GoldenSchwelle>>
}

export interface Golden {
  readonly fixture: string
  readonly hinweis: string
  readonly kurven: Readonly<Record<string, GoldenKurve>>
}

export function ladeFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as Fixture)
}

export function goldenPfad(id: string): string {
  return join(GOLDEN_DIR, `${id}.json`)
}

function rund(x: number | null): number | null {
  return x === null ? null : Math.round(x * 1e4) / 1e4
}

function warnungsCodes(ws: readonly { code: string; stufenIndex?: number }[]): string[] {
  return ws.map((w) => (w.stufenIndex === undefined ? w.code : `${w.code}@${w.stufenIndex + 1}`))
}

export function erzeugeGolden(fixture: Fixture): Golden {
  const kurven: Record<string, GoldenKurve> = {}
  for (const typ of KURVENTYPEN) {
    const a = analysiere(fixture.protokoll, { kurve: typ })
    const schwellen: Record<string, GoldenSchwelle> = {}
    for (const [schluessel, s] of Object.entries(a.schwellen)) {
      schwellen[schluessel] = {
        modellVersion: s.modellVersion,
        wert: rund(s.wert),
        hf: rund(s.hf),
        laktat: rund(s.laktat),
        warnungen: warnungsCodes(s.warnungen),
      }
    }
    kurven[typ] = { kurvenVersion: a.kurve.version, r2: rund(a.kurve.r2) ?? 0, warnungen: warnungsCodes(a.warnungen), schwellen }
  }
  return {
    fixture: fixture.id,
    hinweis: 'Erzeugt mit `npm run golden:update`. Nicht von Hand ändern – Referenzwerte gehören in die Fixture.',
    kurven,
  }
}

function gleich(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) <= GOLDEN_TOLERANZ
}

export interface Abweichung {
  readonly kurve: string
  readonly modell: string
  /** Die Ausgabe hat sich geändert, die Version aber nicht – das ist ein Regelverstoß. */
  readonly ohneVersionssprung: boolean
  readonly beschreibung: string
}

/** Vergleicht eine gespeicherte mit einer frisch erzeugten Golden-Datei. */
export function vergleiche(alt: Golden, neu: Golden): Abweichung[] {
  const abweichungen: Abweichung[] = []
  for (const [typ, neuKurve] of Object.entries(neu.kurven)) {
    const altKurve = alt.kurven[typ]
    if (altKurve === undefined) {
      abweichungen.push({ kurve: typ, modell: '*', ohneVersionssprung: false, beschreibung: 'Kurve neu' })
      continue
    }
    const kurveGleich = altKurve.kurvenVersion === neuKurve.kurvenVersion
    for (const [modell, n] of Object.entries(neuKurve.schwellen)) {
      const a = altKurve.schwellen[modell]
      if (a === undefined) {
        abweichungen.push({ kurve: typ, modell, ohneVersionssprung: false, beschreibung: 'Modell neu' })
        continue
      }
      const wertGleich =
        gleich(a.wert, n.wert) &&
        gleich(a.hf, n.hf) &&
        gleich(a.laktat, n.laktat) &&
        a.warnungen.join() === n.warnungen.join()
      const versionGleich = kurveGleich && a.modellVersion === n.modellVersion
      if (wertGleich && versionGleich) continue
      const beschreibung = `wert ${String(a.wert)} → ${String(n.wert)}, hf ${String(a.hf)} → ${String(n.hf)}, laktat ${String(a.laktat)} → ${String(n.laktat)}, warnungen [${a.warnungen.join(', ')}] → [${n.warnungen.join(', ')}], modellVersion ${a.modellVersion} → ${n.modellVersion}, kurvenVersion ${altKurve.kurvenVersion} → ${neuKurve.kurvenVersion}`
      abweichungen.push({ kurve: typ, modell, ohneVersionssprung: !wertGleich && versionGleich, beschreibung })
    }
    if (altKurve.warnungen.join() !== neuKurve.warnungen.join() || !gleich(altKurve.r2, neuKurve.r2)) {
      abweichungen.push({
        kurve: typ,
        modell: '(Kurve)',
        ohneVersionssprung: kurveGleich,
        beschreibung: `r2 ${altKurve.r2} → ${neuKurve.r2}, warnungen [${altKurve.warnungen.join(', ')}] → [${neuKurve.warnungen.join(', ')}]`,
      })
    }
  }
  return abweichungen
}
