import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analysiere } from '../src/index.ts'
import type { SchwellenSchluessel } from '../src/index.ts'
import { erzeugeGolden, goldenPfad, ladeFixtures, vergleiche } from './golden-lib.ts'
import type { Golden } from './golden-lib.ts'

const fixtures = ladeFixtures()

describe('Golden-Fixtures', () => {
  it('umfassen mindestens fünf Protokolle aus Rad und Lauf', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5)
    expect(fixtures.some((f) => f.protokoll.sportart === 'rad')).toBe(true)
    expect(fixtures.some((f) => f.protokoll.sportart === 'lauf')).toBe(true)
  })

  describe.each(fixtures.map((f) => [f.id, f] as const))('%s', (id, fixture) => {
    it('liefert die gespeicherten Werte – oder eine erhöhte Modellversion', () => {
      const pfad = goldenPfad(id)
      expect(existsSync(pfad), `Golden-Datei fehlt: npm run golden:update`).toBe(true)
      const alt = JSON.parse(readFileSync(pfad, 'utf8')) as Golden
      const abweichungen = vergleiche(alt, erzeugeGolden(fixture))
      const verstoesse = abweichungen.filter((a) => a.ohneVersionssprung)
      expect(
        verstoesse.map((a) => `${a.kurve}/${a.modell}: ${a.beschreibung}`),
        'Ausgabe geändert ohne Versionssprung: modellVersion in src/versionen.ts erhöhen, dann npm run golden:update',
      ).toEqual([])
      expect(
        abweichungen.map((a) => `${a.kurve}/${a.modell}: ${a.beschreibung}`),
        'Version erhöht: Golden-Werte mit npm run golden:update neu erzeugen und die Änderung prüfen',
      ).toEqual([])
    })
  })
})

const mitReferenz = fixtures.filter((f) => Object.keys(f.referenz.werte).length > 0)

describe('Referenzwerte aus WinLactat/Ergonizer', () => {
  it.skipIf(mitReferenz.length > 0)('noch keine Referenzwerte eingetragen', () => {
    expect(mitReferenz).toEqual([])
  })

  describe.each(mitReferenz.map((f) => [f.id, f] as const))('%s', (_id, fixture) => {
    const { referenz } = fixture
    const analyse = analysiere(fixture.protokoll, { kurve: referenz.kurve })
    const eintraege = Object.entries(referenz.werte) as [SchwellenSchluessel, NonNullable<(typeof referenz.werte)[SchwellenSchluessel]>][]
    it.each(eintraege)(`%s stimmt mit ${referenz.quelle ?? 'Referenz'} überein`, (modell, soll) => {
      const ist = analyse.schwellen[modell]
      if (soll.wert !== undefined) {
        expect(ist.wert).not.toBeNull()
        expect(Math.abs((ist.wert ?? NaN) - soll.wert)).toBeLessThanOrEqual(referenz.toleranz.wert)
      }
      if (soll.hf !== undefined) {
        expect(Math.abs((ist.hf ?? NaN) - soll.hf)).toBeLessThanOrEqual(referenz.toleranz.hf)
      }
      if (soll.laktat !== undefined) {
        expect(Math.abs((ist.laktat ?? NaN) - soll.laktat)).toBeLessThanOrEqual(referenz.toleranz.laktat)
      }
    })
  })
})
