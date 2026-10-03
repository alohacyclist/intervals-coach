import { describe, expect, it } from 'vitest'
import {
  MODELL_VERSIONEN,
  analysiere,
  basisliniePlus,
  dickhuthIas,
  dmax,
  festeSchwelle,
  laktataequivalentMinimum,
  logLog,
  modDmax,
  schwelle2mmol,
  schwelle4mmol,
} from '../src/index.ts'
import type { Kurventyp, SchwellenSchluessel } from '../src/index.ts'
import { WATT, kontext, nullstelle, rad, stufenAus } from './helfer.ts'

/**
 * Exakte Exponentialdaten: der Exponentialfit trifft sie genau, also lassen sich alle
 * kurvenbasierten Schwellen geschlossen bzw. mit einer unabhängigen Nullstellensuche angeben.
 */
const A = 0.8
const B = 0.03
const C = 0.017
const expo = (x: number) => A + B * Math.exp(C * x)
const hfLinear = (x: number) => 90 + 0.3 * x
const XS = [100, 140, 180, 220, 260, 300, 340]
const expoKontext = () => kontext(rad(stufenAus(XS, expo, hfLinear)), 'exponential')
const intensitaetBei = (laktat: number) => Math.log((laktat - A) / B) / C

describe('Feste Schwellen', () => {
  it('2 und 4 mmol/L treffen die analytische Lösung', () => {
    const ctx = expoKontext()
    const s2 = schwelle2mmol(ctx)
    const s4 = schwelle4mmol(ctx)
    expect(s2.wert).toBeCloseTo(intensitaetBei(2), 5)
    expect(s4.wert).toBeCloseTo(intensitaetBei(4), 5)
    expect(s4.laktat).toBe(4)
    expect(s4.hf).toBeCloseTo(hfLinear(intensitaetBei(4)), 5)
    expect(s4).toMatchObject({
      modell: 'fest-4',
      modellVersion: MODELL_VERSIONEN.fest,
      kurve: { typ: 'exponential', version: 1 },
      einheit: 'watt',
      warnungen: [],
    })
  })

  it('liefert null, wenn der Wert im Test nicht erreicht wird', () => {
    const ctx = kontext(rad(stufenAus([100, 140, 180, 220, 260], (x) => 0.8 + 0.005 * x)))
    const s = festeSchwelle(ctx, 4)
    expect(s.wert).toBeNull()
    expect(s.hf).toBeNull()
    expect(s.warnungen.map((w) => w.code)).toEqual(['ZIEL_NICHT_ERREICHT'])
  })

  it('liefert null, wenn die ganze Kurve schon darüber liegt', () => {
    const ctx = kontext(rad(stufenAus(WATT, (x) => 2.5 + 0.00002 * x * x)))
    const s = schwelle2mmol(ctx)
    expect(s.wert).toBeNull()
    expect(s.warnungen.map((w) => w.code)).toEqual(['ZIEL_UNTER_KURVENMINIMUM'])
  })

  it('zählt erhöhtes Laktat zu Testbeginn nicht als Schwelle', () => {
    const ys = [2.3, 1.6, 1.4, 1.6, 2.2, 3.4, 5.6]
    const ctx = kontext(rad(ys.map((laktat, i) => ({ intensitaet: 100 + 40 * i, laktat }))))
    const s = schwelle2mmol(ctx)
    // Gesucht wird ab dem Kurvenminimum, also auf dem ansteigenden Ast zwischen 220 und 260 W.
    expect(s.wert).toBeGreaterThan(220)
    expect(s.wert).toBeLessThan(260)
  })
})

describe('Basislinie + 1,0 mmol/L', () => {
  const ys = [1.3, 1.1, 1.2, 1.6, 2.4, 3.9, 6.5]
  const protokoll = rad(
    ys.map((laktat, i) => ({ intensitaet: 100 + 40 * i, laktat })),
    { ruhelaktat: 0.9 },
  )

  it('nimmt standardmäßig den niedrigsten Messwert', () => {
    const s = basisliniePlus(kontext(protokoll))
    expect(s.details.basislinie).toBe(1.1)
    expect(s.laktat).toBeCloseTo(2.1, 12)
    const ctx = kontext(protokoll)
    expect(ctx.kurve.f(s.wert ?? 0)).toBeCloseTo(2.1, 8)
  })

  it('kann das Ruhelaktat oder das Kurvenminimum als Basislinie nehmen', () => {
    const ruhe = basisliniePlus(kontext(protokoll), { basislinie: 'ruhelaktat' })
    expect(ruhe.details.basislinie).toBe(0.9)
    expect(ruhe.laktat).toBeCloseTo(1.9, 12)
    const kurve = basisliniePlus(kontext(protokoll), { basislinie: 'kurvenminimum', zuschlag: 1.5 })
    expect(kurve.details.basislinienArt).toBe('kurvenminimum')
    expect(kurve.laktat).toBeCloseTo(Number(kurve.details.basislinie) + 1.5, 12)
  })

  it('fällt ohne Ruhelaktat auf den Messwert zurück und sagt das', () => {
    const ohneRuhe = rad(protokoll.stufen)
    const s = basisliniePlus(kontext(ohneRuhe), { basislinie: 'ruhelaktat' })
    expect(s.details.basislinie).toBe(1.1)
    expect(s.warnungen.map((w) => w.code)).toContain('RUHELAKTAT_FEHLT')
  })
})

describe('Laktatäquivalent und Dickhuth-IAS', () => {
  it('LE-Minimum erfüllt d/dx (La/x) = 0', () => {
    const s = laktataequivalentMinimum(expoKontext())
    // Unabhängig gelöst: B·C·x·e^(Cx) − A − B·e^(Cx) = 0
    const soll = nullstelle((x) => B * C * x * Math.exp(C * x) - A - B * Math.exp(C * x), 50, 400)
    expect(s.wert).toBeCloseTo(soll, 4)
    expect(s.laktat).toBeCloseTo(expo(soll), 6)
    expect(s.details.laktataequivalent).toBeCloseTo(expo(soll) / soll, 8)
  })

  it('IAS liegt 1,5 mmol/L über dem Laktat am LE-Minimum', () => {
    const ctx = expoKontext()
    const le = laktataequivalentMinimum(ctx)
    const ias = dickhuthIas(ctx)
    expect(ias.laktat).toBeCloseTo((le.laktat ?? 0) + 1.5, 10)
    expect(ias.wert).toBeCloseTo(intensitaetBei((le.laktat ?? 0) + 1.5), 4)
    expect(ias.details.leMinimum).toBe(le.wert)
    expect(dickhuthIas(ctx, { zuschlag: 1 }).laktat).toBeCloseTo((le.laktat ?? 0) + 1, 10)
  })
})

describe('Dmax', () => {
  it('liegt dort, wo die Kurvensteigung der Geradensteigung entspricht', () => {
    const s = dmax(expoKontext())
    const x0 = XS[0] ?? 0
    const x1 = XS[XS.length - 1] ?? 0
    const m = (expo(x1) - expo(x0)) / (x1 - x0)
    expect(s.wert).toBeCloseTo(Math.log(m / (B * C)) / C, 4)
    expect(s.details.steigungGerade).toBeCloseTo(m, 10)
  })

  it('kann die Gerade an die Kurvenwerte statt an die Messwerte legen', () => {
    // Bei exakten Daten sind beide Varianten gleich
    const ctx = expoKontext()
    expect(dmax(ctx, { endpunkte: 'kurve' }).wert).toBeCloseTo(dmax(ctx).wert ?? 0, 4)
  })

  it('ModDmax beginnt an der Stufe vor dem ersten Anstieg > 0,4 mmol/L', () => {
    const ctx = expoKontext()
    const ys = XS.map(expo)
    const start = ys.findIndex((y, i) => (ys[i + 1] ?? -Infinity) - y > 0.4)
    const xs = XS[start] ?? 0
    const xe = XS[XS.length - 1] ?? 0
    const m = (expo(xe) - expo(xs)) / (xe - xs)
    const s = modDmax(ctx)
    expect(s.details.startStufe).toBe(start + 1)
    expect(s.wert).toBeCloseTo(Math.log(m / (B * C)) / C, 4)
    // Spätere Startstufe, steilere Gerade: ModDmax liegt rechts von Dmax
    expect(s.wert ?? 0).toBeGreaterThan(dmax(ctx).wert ?? Infinity)
  })

  it('ModDmax ohne deutlichen Anstieg liefert null', () => {
    const ctx = kontext(rad(stufenAus(WATT, (x) => 1 + 0.002 * x)))
    const s = modDmax(ctx)
    expect(s.wert).toBeNull()
    expect(s.warnungen.map((w) => w.code)).toEqual(['KEIN_ANSTIEG'])
  })

  it('Dmax ohne Krümmung nach oben liefert null', () => {
    const ctx = kontext(rad(stufenAus(WATT, (x) => 8 - 6 * Math.exp(-0.01 * (x - 100)))))
    expect(dmax(ctx).warnungen.map((w) => w.code)).toContain('KEIN_DMAX')
  })
})

describe('Log-Log-Breakpoint', () => {
  it('findet den Knick exakter zweisegmentiger Daten', () => {
    const knick = 210
    const f = (x: number) => {
      const lx = Math.log(x)
      const lk = Math.log(knick)
      return Math.exp(0.1 + 0.05 * (lx - lk) + 3 * Math.max(0, lx - lk))
    }
    const s = logLog(kontext(rad(stufenAus([100, 130, 160, 190, 220, 250, 280, 310], f))))
    expect(s.wert).toBeCloseTo(knick, 6)
    expect(s.laktat).toBeCloseTo(Math.exp(0.1), 8)
    expect(s.details.steigungUnten).toBeCloseTo(0.05, 6)
    expect(s.details.steigungOben).toBeCloseTo(3.05, 6)
    expect(s.kurve).toBeNull()
  })

  it('meldet fehlenden Knick', () => {
    const s = logLog(kontext(rad(stufenAus(WATT, (x) => 3 * Math.pow(x / 100, -0.2)))))
    expect(s.wert).toBeNull()
    expect(s.warnungen.map((w) => w.code)).toEqual(['KEIN_KNICK'])
  })
})

describe('Einheitenunabhängigkeit', () => {
  // Werden alle Intensitäten mit k multipliziert, müssen alle Schwellen mitwandern.
  const ys = [1.2, 1.1, 1.3, 1.8, 2.7, 4.2, 6.8]
  const basis = rad(ys.map((laktat, i) => ({ intensitaet: 8 + i, laktat, hf: 130 + 8 * i })))
  const skaliert = rad(basis.stufen.map((s) => ({ ...s, intensitaet: s.intensitaet * 3.6 })))

  it.each<Kurventyp>(['polynom3', 'exponential', 'monotoner-spline'])('%s', (typ) => {
    const a = analysiere(basis, { kurve: typ })
    const b = analysiere(skaliert, { kurve: typ })
    for (const schluessel of Object.keys(a.schwellen) as SchwellenSchluessel[]) {
      const sa = a.schwellen[schluessel]
      const sb = b.schwellen[schluessel]
      expect(sa.wert, schluessel).not.toBeNull()
      expect(sb.wert ?? 0, schluessel).toBeCloseTo((sa.wert ?? 0) * 3.6, 3)
      expect(sb.laktat ?? 0, schluessel).toBeCloseTo(sa.laktat ?? 0, 5)
      expect(sb.hf ?? 0, schluessel).toBeCloseTo(sa.hf ?? 0, 3)
    }
  })
})

describe('analysiere', () => {
  it('liefert alle Modelle mit Version und eine abgetastete Kurve', () => {
    const a = analysiere({
      sportart: 'lauf',
      stufen: [9, 10, 11, 12, 13, 14, 15].map((v, i) => ({ intensitaet: v, laktat: [1.2, 1.1, 1.3, 1.7, 2.5, 3.9, 6.2][i] ?? 0 })),
    })
    expect(a.einheit).toBe('kmh')
    expect(a.engineVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(Object.keys(a.schwellen).sort()).toEqual(
      ['basislinie-plus', 'dickhuth-ias', 'dmax', 'fest-2', 'fest-4', 'le-minimum', 'log-log', 'mod-dmax'].sort(),
    )
    for (const s of Object.values(a.schwellen)) {
      expect(s.modellVersion).toBeGreaterThanOrEqual(1)
      expect(s.einheit).toBe('kmh')
    }
    expect(a.kurve.punkte).toHaveLength(101)
    expect(a.kurve.punkte[0]?.x).toBe(9)
    expect(a.kurve.punkte[100]?.x).toBeCloseTo(15, 12)
    // Ergebnis ist JSON-serialisierbar (wird so gespeichert)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })

  it('ordnet die Schwellen sinnvoll: LT1-Modelle unter LT2-Modellen', () => {
    const a = analysiere(basisProtokoll())
    const s = a.schwellen
    const w = (k: SchwellenSchluessel) => s[k].wert ?? NaN
    expect(w('le-minimum')).toBeLessThan(w('dickhuth-ias'))
    expect(w('basislinie-plus')).toBeLessThan(w('fest-4'))
    expect(w('fest-2')).toBeLessThan(w('fest-4'))
    expect(w('dmax')).toBeLessThan(w('mod-dmax'))
    expect(w('log-log')).toBeLessThan(w('dmax'))
  })
})

function basisProtokoll() {
  return rad(
    [1.1, 1.0, 1.1, 1.4, 2.1, 3.4, 5.6, 8.9].map((laktat, i) => ({ intensitaet: 100 + 40 * i, laktat, hf: 112 + 10 * i })),
  )
}
