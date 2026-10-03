import { describe, expect, it } from 'vitest'
import {
  DREI_ZONEN,
  FUENF_ZONEN,
  SIEBEN_ZONEN,
  ZONENMODELLE,
  ZonenFehler,
  berechneZonen,
  grenzwert,
  hfBei,
  paceAusKmh,
} from '../src/index.ts'
import type { Stufe, Zonenmodell } from '../src/index.ts'

const radStufen: Stufe[] = [100, 140, 180, 220, 260, 300, 340].map((w, i) => ({
  intensitaet: w,
  laktat: 1 + i,
  hf: 110 + 10 * i,
}))

describe('hfBei', () => {
  it('interpoliert zwischen den Stufen', () => {
    expect(hfBei(radStufen, 160)).toEqual({ hf: 125, extrapoliert: false })
    expect(hfBei(radStufen, 340)).toEqual({ hf: 170, extrapoliert: false })
  })

  it('setzt außerhalb mit der Regressionssteigung fort, stetig am Rand', () => {
    expect(hfBei(radStufen, 80)?.hf).toBeCloseTo(105, 10)
    expect(hfBei(radStufen, 80)?.extrapoliert).toBe(true)
    expect(hfBei(radStufen, 360)?.hf).toBeCloseTo(175, 10)
  })

  it('überspringt Stufen ohne HF und braucht mindestens zwei Werte', () => {
    const luecken = radStufen.map((s, i) => (i % 2 === 1 ? { intensitaet: s.intensitaet, laktat: s.laktat } : s))
    expect(hfBei(luecken, 160)?.hf).toBeCloseTo(125, 10)
    expect(hfBei([{ intensitaet: 100, laktat: 1, hf: 120 }], 100)).toBeNull()
  })
})

describe('berechneZonen', () => {
  it('3 Zonen: Grenzen genau an LT1 und LT2, unten und oben offen', () => {
    const z = berechneZonen(DREI_ZONEN, { lt1: 180, lt2: 260 }, { einheit: 'watt', stufen: radStufen })
    expect(z.zeilen.map((r) => r.intensitaet)).toEqual([
      { von: null, bis: 180 },
      { von: 180, bis: 260 },
      { von: 260, bis: null },
    ])
    expect(z.zeilen.map((r) => r.hf)).toEqual([
      { von: null, bis: 130 },
      { von: 130, bis: 150 },
      { von: 150, bis: null },
    ])
    expect(z.zeilen.every((r) => r.pace === null)).toBe(true)
    expect(z.hfExtrapoliert).toBe(false)
    expect(z).toMatchObject({ modell: 'drei-zonen', modellVersion: 1, lt1: 180, lt2: 260 })
  })

  it('Zonen schließen lückenlos aneinander an', () => {
    for (const modell of ZONENMODELLE) {
      const z = berechneZonen(modell, { lt1: 190, lt2: 275 }, { einheit: 'watt', stufen: radStufen })
      expect(z.zeilen).toHaveLength(modell.zonen.length)
      for (let i = 1; i < z.zeilen.length; i++) {
        expect(z.zeilen[i]?.intensitaet.von).toBe(z.zeilen[i - 1]?.intensitaet.bis)
        expect(z.zeilen[i]?.hf?.von).toBe(z.zeilen[i - 1]?.hf?.bis)
        expect((z.zeilen[i]?.intensitaet.von ?? 0) > (z.zeilen[i - 1]?.intensitaet.von ?? 0)).toBe(true)
      }
    }
  })

  it('5 Zonen rechnen die Faktoren richtig', () => {
    const z = berechneZonen(FUENF_ZONEN, { lt1: 200, lt2: 280 }, { einheit: 'watt' })
    expect(z.zeilen.map((r) => r.intensitaet.bis)).toEqual([160, 200, 266, 294, null])
    expect(z.zeilen.every((r) => r.hf === null)).toBe(true)
  })

  it('7 Zonen setzen die Tempogrenze in die Mitte zwischen LT1 und LT2', () => {
    expect(grenzwert({ anker: 'LT1-LT2', anteil: 0.5 }, { lt1: 200, lt2: 280 })).toBe(240)
    const z = berechneZonen(SIEBEN_ZONEN, { lt1: 200, lt2: 280 }, { einheit: 'watt' })
    expect(z.zeilen[2]?.intensitaet).toEqual({ von: 200, bis: 240 })
  })

  it('Lauf: km/h auf 0,1 gerundet, dazu Pace in s/km', () => {
    const laufStufen: Stufe[] = [9, 10, 11, 12, 13, 14, 15].map((v, i) => ({ intensitaet: v, laktat: 1 + i, hf: 135 + 7 * i }))
    const z = berechneZonen(DREI_ZONEN, { lt1: 12.44, lt2: 14.12 }, { einheit: 'kmh', stufen: laufStufen })
    expect(z.zeilen[1]?.intensitaet).toEqual({ von: 12.4, bis: 14.1 })
    expect(z.zeilen[1]?.pace).toEqual({ von: paceAusKmh(12.4), bis: paceAusKmh(14.1) })
    expect(paceAusKmh(12)).toBe(300)
    expect(z.zeilen[0]?.pace).toEqual({ von: null, bis: paceAusKmh(12.4) })
  })

  it('markiert HF-Grenzen außerhalb der Stufen als fortgeschrieben', () => {
    const z = berechneZonen(FUENF_ZONEN, { lt1: 110, lt2: 300 }, { einheit: 'watt', stufen: radStufen })
    expect(z.hfExtrapoliert).toBe(true)
  })

  it('lehnt unbrauchbare Schwellen und Modelle ab', () => {
    expect(() => berechneZonen(DREI_ZONEN, { lt1: 260, lt2: 180 }, { einheit: 'watt' })).toThrow(ZonenFehler)
    // LT1 so nah an LT2, dass 1,0·LT1 über 0,95·LT2 liegt
    expect(() => berechneZonen(FUENF_ZONEN, { lt1: 270, lt2: 280 }, { einheit: 'watt' })).toThrow(/steigen/)
    const kaputt: Zonenmodell = { ...DREI_ZONEN, grenzen: [{ anker: 'LT1', faktor: 1 }] }
    expect(() => berechneZonen(kaputt, { lt1: 180, lt2: 260 }, { einheit: 'watt' })).toThrow(/Grenzen/)
  })
})
