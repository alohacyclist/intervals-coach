import { minimize } from '../numerik.ts'
import { amRand } from '../suche.ts'
import type { Analysekontext, Schwellenergebnis, Warnung } from '../typen.ts'
import { ergebnis, fmt, randWarnung } from './gemeinsam.ts'

/**
 * Wo die Gerade ansetzt: an den gemessenen Laktatwerten (Standard, wie in der
 * Aufgabenstellung „Gerade erster–letzter Punkt“) oder an den Kurvenwerten derselben Stufen.
 */
export type Endpunkte = 'messwerte' | 'kurve'

export interface DmaxOptionen {
  readonly endpunkte?: Endpunkte
}

export interface ModDmaxOptionen extends DmaxOptionen {
  /** Anstieg zwischen zwei Stufen, ab dem die Gerade beginnt (mmol/L). */
  readonly anstieg?: number
}

/**
 * Punkt der Kurve mit dem größten senkrechten Abstand unter der Geraden zwischen Stufe
 * `start` und der letzten Stufe. Der senkrechte Abstand ist der vertikale mal cos des
 * Geradenwinkels – sein Maximum liegt also dort, wo der vertikale Abstand maximal ist,
 * unabhängig davon, wie Intensität und Laktat gegeneinander skaliert sind.
 */
function maxAbstand(
  ctx: Analysekontext,
  familie: 'dmax' | 'mod-dmax',
  start: number,
  endpunkte: Endpunkte,
  name: string,
  warnungen: Warnung[],
  details: Record<string, number | string>,
): Schwellenergebnis {
  const { stufen } = ctx.protokoll
  const { kurve } = ctx
  const a = stufen[start]
  const b = stufen[stufen.length - 1]
  if (a === undefined || b === undefined) throw new RangeError('Stufe außerhalb des Protokolls')
  const ya = endpunkte === 'kurve' ? kurve.f(a.intensitaet) : a.laktat
  const yb = endpunkte === 'kurve' ? kurve.f(b.intensitaet) : b.laktat
  const steigung = (yb - ya) / (b.intensitaet - a.intensitaet)
  const abstand = (x: number) => ya + steigung * (x - a.intensitaet) - kurve.f(x)
  const x = minimize((t) => -abstand(t), a.intensitaet, b.intensitaet)
  const d = abstand(x)
  const alleDetails = { ...details, steigungGerade: steigung, abstandVertikal: d, geradeAb: a.intensitaet }
  if (!(d > 0)) {
    return ergebnis(familie, familie, ctx, {
      wert: null,
      laktat: null,
      warnungen: [
        ...warnungen,
        {
          code: 'KEIN_DMAX',
          schwere: 'warnung',
          nachricht: `${name}: die Kurve liegt nirgends unter der Geraden, es gibt keinen Punkt maximalen Abstands.`,
        },
      ],
      details: alleDetails,
    })
  }
  if (amRand(kurve, x)) warnungen.push(randWarnung(name))
  return ergebnis(familie, familie, ctx, { wert: x, laktat: kurve.f(x), warnungen, details: alleDetails })
}

/** Dmax (Cheng 1992): maximaler Abstand der Kurve zur Geraden erste–letzte Stufe. */
export function dmax(ctx: Analysekontext, optionen: DmaxOptionen = {}): Schwellenergebnis {
  return maxAbstand(ctx, 'dmax', 0, optionen.endpunkte ?? 'messwerte', 'Dmax', [], {})
}

/**
 * Modifiziertes Dmax (Bishop 1998): die Gerade beginnt an der Stufe vor dem ersten Anstieg
 * um mehr als 0,4 mmol/L zur nächsten Stufe.
 */
export function modDmax(ctx: Analysekontext, optionen: ModDmaxOptionen = {}): Schwellenergebnis {
  const anstieg = optionen.anstieg ?? 0.4
  const { stufen } = ctx.protokoll
  const start = stufen.findIndex((s, i) => {
    const naechste = stufen[i + 1]
    return naechste !== undefined && naechste.laktat - s.laktat > anstieg
  })
  if (start === -1) {
    return ergebnis('mod-dmax', 'mod-dmax', ctx, {
      wert: null,
      laktat: null,
      warnungen: [
        {
          code: 'KEIN_ANSTIEG',
          schwere: 'warnung',
          nachricht: `Kein Anstieg über ${fmt(anstieg)} mmol/L zwischen zwei Stufen; ModDmax lässt sich nicht bestimmen.`,
        },
      ],
      details: { anstieg },
    })
  }
  const warnungen: Warnung[] = []
  if (start === stufen.length - 2) {
    warnungen.push({
      code: 'AM_RAND_DES_MESSBEREICHS',
      schwere: 'warnung',
      nachricht: 'Der erste deutliche Anstieg liegt erst zwischen den letzten beiden Stufen; ModDmax stützt sich nur auf diesen Abschnitt.',
    })
  }
  return maxAbstand(ctx, 'mod-dmax', start, optionen.endpunkte ?? 'messwerte', 'ModDmax', warnungen, {
    anstieg,
    startStufe: start + 1,
  })
}
