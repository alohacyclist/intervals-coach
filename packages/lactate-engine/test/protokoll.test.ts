import { describe, expect, it } from 'vitest'
import { ProtokollFehler, analysiere, findeAuffaelligkeiten, pruefeProtokoll } from '../src/index.ts'
import type { Stufe } from '../src/index.ts'
import { rad } from './helfer.ts'

const stufen = (laktat: readonly number[], extra: (i: number) => Partial<Stufe> = () => ({})): Stufe[] =>
  laktat.map((l, i) => ({ intensitaet: 100 + 40 * i, laktat: l, ...extra(i) }))

const codes = (laktat: readonly number[], extra?: (i: number) => Partial<Stufe>) =>
  findeAuffaelligkeiten(pruefeProtokoll(rad(stufen(laktat, extra)))).map((w) => w.code)

describe('pruefeProtokoll', () => {
  it('leitet die Einheit aus der Sportart ab', () => {
    expect(pruefeProtokoll(rad(stufen([1, 1.2, 2, 4]))).einheit).toBe('watt')
    expect(pruefeProtokoll({ sportart: 'lauf', stufen: stufen([1, 1.2, 2, 4]) }).einheit).toBe('kmh')
    expect(pruefeProtokoll({ sportart: 'lauf', einheit: 'watt', stufen: stufen([1, 1.2, 2, 4]) }).einheit).toBe('watt')
  })

  it('verlangt mindestens vier Stufen', () => {
    expect(() => pruefeProtokoll(rad(stufen([1, 2, 4])))).toThrow(ProtokollFehler)
  })

  it('verlangt streng steigende Intensität', () => {
    const s = stufen([1, 1.2, 2, 4])
    const fehlerhaft = [...s.slice(0, 2), { ...s[2], intensitaet: 140, laktat: 2 }, ...s.slice(3)]
    try {
      pruefeProtokoll(rad(fehlerhaft))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ProtokollFehler)
      expect((e as ProtokollFehler).fehler).toEqual(['Stufe 3: Intensität muss höher sein als in Stufe 2.'])
    }
  })

  it('lehnt nicht positive und fehlende Werte ab', () => {
    expect(() => pruefeProtokoll(rad(stufen([1, 0, 2, 4])))).toThrow(/Stufe 2: Laktat/)
    expect(() => pruefeProtokoll(rad(stufen([1, Number.NaN, 2, 4])))).toThrow(/Stufe 2: Laktat/)
    expect(() => pruefeProtokoll(rad(stufen([1, 1.2, 2, 4], (i) => (i === 1 ? { hf: -1 } : {}))))).toThrow(/Herzfrequenz/)
    expect(() => pruefeProtokoll(rad(stufen([1, 1.2, 2, 4]), { ruhelaktat: 0 }))).toThrow(/Ruhelaktat/)
  })

  it('analysiere wirft für unauswertbare Protokolle', () => {
    expect(() => analysiere(rad(stufen([1, 2])))).toThrow(ProtokollFehler)
  })
})

describe('findeAuffaelligkeiten', () => {
  it('meldet einen Laktatabfall über 0,5 mmol/L an der richtigen Stufe', () => {
    const w = findeAuffaelligkeiten(pruefeProtokoll(rad(stufen([1.0, 1.2, 2.2, 1.6, 4.0, 6.8]))))
    const abfall = w.filter((x) => x.code === 'LAKTATABFALL')
    expect(abfall).toHaveLength(1)
    expect(abfall[0]?.stufenIndex).toBe(3)
    expect(abfall[0]?.nachricht).toContain('Stufe 4')
    expect(abfall[0]?.nachricht).toContain('0,6')
  })

  it('toleriert einen Abfall von genau 0,5 mmol/L', () => {
    expect(codes([1.5, 1.0, 1.3, 2.0, 4.0, 6.8])).not.toContain('LAKTATABFALL')
  })

  it('übernimmt eine eigene Abfallgrenze', () => {
    const w = findeAuffaelligkeiten(pruefeProtokoll(rad(stufen([1.5, 1.2, 1.3, 2.0, 4.0, 6.8]))), { laktatAbfall: 0.2 })
    expect(w.map((x) => x.code)).toContain('LAKTATABFALL')
  })

  it('meldet fallende Herzfrequenz und unplausible Werte', () => {
    const hf = [110, 120, 112, 140, 150, 250]
    const c = codes([1.0, 1.2, 1.6, 2.4, 4.0, 30], (i) => ({ hf: hf[i] ?? 0 }))
    expect(c).toContain('HF_ABFALL')
    expect(c).toContain('HF_UNPLAUSIBEL')
    expect(c).toContain('LAKTAT_UNPLAUSIBEL')
  })

  it('weist auf wenige Stufen und ein niedriges Maximallaktat hin', () => {
    const c = codes([1.0, 1.2, 1.6, 2.4, 3.1])
    expect(c).toContain('WENIGE_STUFEN')
    expect(c).toContain('MAXIMALLAKTAT_NIEDRIG')
    expect(codes([1.0, 1.1, 1.2, 1.6, 2.4, 4.1])).toEqual([])
  })

  it('weist auf kurze und uneinheitliche Stufen hin, die letzte Stufe ausgenommen', () => {
    expect(codes([1.0, 1.1, 1.2, 1.6, 2.4, 4.1], (i) => ({ dauerSek: i === 5 ? 60 : 180 }))).toEqual([])
    const c = codes([1.0, 1.1, 1.2, 1.6, 2.4, 4.1], (i) => ({ dauerSek: i < 3 ? 120 : 180 }))
    expect(c).toContain('STUFENDAUER_KURZ')
    expect(c).toContain('STUFENDAUER_UNEINHEITLICH')
  })

  it('weist auf erhöhtes Ruhelaktat hin', () => {
    const w = findeAuffaelligkeiten(pruefeProtokoll(rad(stufen([1.0, 1.1, 1.2, 1.6, 2.4, 4.1]), { ruhelaktat: 3.1 })))
    expect(w.map((x) => x.code)).toEqual(['RUHELAKTAT_HOCH'])
  })

  it('formuliert keine medizinischen Aussagen', () => {
    const w = findeAuffaelligkeiten(
      pruefeProtokoll(rad(stufen([1.0, 1.2, 2.2, 1.6, 3.1], (i) => ({ hf: [110, 120, 112, 140, 250][i] ?? 0 })), { ruhelaktat: 3 })),
    )
    for (const { nachricht } of w) {
      expect(nachricht).not.toMatch(/diagnos|krank|patholog|befund|therapie/i)
    }
  })
})
