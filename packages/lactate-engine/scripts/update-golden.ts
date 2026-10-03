/**
 * Erzeugt test/golden/*.json neu.
 *
 * Weigert sich, wenn sich die Ausgabe eines Modells geändert hat, ohne dass dessen
 * modellVersion (oder die Kurvenversion) gestiegen ist. `--force` übergeht das – nur nach
 * Rücksprache, etwa wenn sich das Protokoll einer Fixture selbst geändert hat.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { GOLDEN_DIR, erzeugeGolden, goldenPfad, ladeFixtures, vergleiche } from '../test/golden-lib.ts'
import type { Golden } from '../test/golden-lib.ts'

const force = process.argv.includes('--force')
mkdirSync(GOLDEN_DIR, { recursive: true })

const verstoesse: string[] = []
const zuSchreiben: { id: string; pfad: string; golden: Golden }[] = []
for (const fixture of ladeFixtures()) {
  const pfad = goldenPfad(fixture.id)
  const neu = erzeugeGolden(fixture)
  if (existsSync(pfad)) {
    const alt = JSON.parse(readFileSync(pfad, 'utf8')) as Golden
    const abw = vergleiche(alt, neu)
    if (abw.length === 0) continue
    for (const a of abw.filter((x) => x.ohneVersionssprung)) {
      verstoesse.push(`${fixture.id} / ${a.kurve} / ${a.modell}: ${a.beschreibung}`)
    }
  }
  zuSchreiben.push({ id: fixture.id, pfad, golden: neu })
}

if (verstoesse.length > 0 && !force) {
  console.error('Ausgabe geändert ohne Versionssprung – erst modellVersion in src/versionen.ts erhöhen:\n')
  for (const v of verstoesse) console.error(`  ${v}`)
  process.exit(1)
}
for (const { pfad, golden } of zuSchreiben) writeFileSync(pfad, `${JSON.stringify(golden, null, 2)}\n`)
console.log(
  zuSchreiben.length === 0 ? 'Golden-Dateien unverändert.' : `Neu geschrieben: ${zuSchreiben.map((z) => z.id).join(', ')}`,
)
