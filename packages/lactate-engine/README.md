# @kalibra/lactate-engine

Auswertung von Laktat-Stufentests: Kurvenanpassung, Schwellenmodelle, Trainingszonen.
Reines TypeScript ohne Laufzeitabhängigkeiten. Die Ergebnisse dienen der Trainingssteuerung,
nicht der medizinischen Diagnostik.

## Setup

```bash
cd packages/lactate-engine
npm install
npm run check          # Typecheck, ESLint, Vitest
npm test               # nur Tests
npm run golden:update  # Golden-Dateien nach einer Modelländerung neu erzeugen
```

## Benutzung

```ts
import { analysiere, berechneZonen, FUENF_ZONEN } from '@kalibra/lactate-engine'

const analyse = analysiere(
  {
    sportart: 'rad', // Einheit: Watt (Lauf: km/h)
    ruhelaktat: 0.9,
    stufen: [
      { intensitaet: 100, laktat: 1.1, hf: 112, dauerSek: 240 },
      { intensitaet: 140, laktat: 1.0, hf: 121, dauerSek: 240 },
      // …
    ],
  },
  { kurve: 'polynom3' }, // oder 'exponential', 'monotoner-spline'
)

analyse.schwellen['dickhuth-ias'] // { wert, hf, laktat, modell, modellVersion, kurve, warnungen, details }

const zonen = berechneZonen(
  FUENF_ZONEN,
  { lt1: analyse.schwellen['basislinie-plus'].wert!, lt2: analyse.schwellen['dickhuth-ias'].wert! },
  { einheit: analyse.einheit, stufen: protokoll.stufen },
)
```

Jedes Modell lässt sich auch einzeln aufrufen (`schwelle4mmol(ctx)`, `dmax(ctx)` …) mit einem
`Analysekontext` aus `pruefeProtokoll` und `passeKurveAn`. `analysiere` ist JSON-serialisierbar
und trägt `engineVersion`, Kurventyp und -version sowie je Schwelle die `modellVersion`. So
gespeichert, bleibt jedes Ergebnis nachvollziehbar.

## Kurven

| Typ | Verfahren |
| --- | --- |
| `polynom3` (Standard) | Kleinste Quadrate, QR-Zerlegung auf zentrierter Intensität. `parameter` enthält a0…a3 in Rohintensität |
| `exponential` | La = a + b·e^(c·x). c wird eindimensional gesucht, a und b sind dann linear (keine Startwerte nötig) |
| `monotoner-spline` | Steffen-Spline (monoton, lokal) durch die Messwerte. Fallende Werte werden vorher per isotoner Regression gemittelt |

Schwellen werden nur innerhalb des Messbereichs gesucht, es wird nicht extrapoliert.
Wird eine Schwelle nicht gefunden, ist `wert: null` und eine Warnung erklärt den Grund.

## Schwellenmodelle

| Schlüssel | Definition | Rolle |
| --- | --- | --- |
| `fest-2`, `fest-4` | Kurve erreicht 2 bzw. 4 mmol/L (4 = OBLA). Suche ab dem Kurvenminimum | LT1 / LT2 |
| `basislinie-plus` | Basislinie + 1,0 mmol/L | LT1 |
| `le-minimum` | Minimum von Laktat/Intensität auf der Kurve | LT1 |
| `dickhuth-ias` | Laktat am LE-Minimum + 1,5 mmol/L | LT2 |
| `dmax` | Größter Abstand der Kurve unter der Geraden von erster zu letzter Stufe | LT2 |
| `mod-dmax` | Wie Dmax, die Gerade beginnt aber an der Stufe vor dem ersten Anstieg > 0,4 mmol/L zur Folgestufe | LT2 |
| `log-log` | Stetige zweisegmentige Regression von ln(Laktat) gegen ln(Intensität) auf den Messwerten | LT1 |

Die Herzfrequenz an einer Schwelle wird linear zwischen den Stufen interpoliert.

### Getroffene Annahmen (einstellbar, fachlich zu bestätigen)

- **Basislinie** = niedrigster gemessener Laktatwert im Test. Alternativ `kurvenminimum` oder
  `ruhelaktat` (`{ basislinie: { basislinie: 'ruhelaktat' } }`). Der Aufschlag ist einstellbar.
- **Dmax/ModDmax**: Die Gerade verbindet die *gemessenen* Laktatwerte. Mit
  `endpunkte: 'kurve'` verbindet sie die Kurvenwerte derselben Stufen.
- **ModDmax**: Der „erste Anstieg > 0,4 mmol/L“ wird zwischen aufeinanderfolgenden Stufen gemessen.
- **Log-Log**: Beide Segmente teilen sich den Knickpunkt (stetig). Jedes Segment trägt
  mindestens zwei Stufen. Ein Knick zählt erst ab 0,1 Steigungsdifferenz. Das Laktat am Knick
  stammt aus der Log-Log-Regression, nicht aus der Kurve.
- **Feste Schwellen**: Die Suche beginnt am Kurvenminimum, damit erhöhtes Laktat nach dem
  Einfahren nicht als Schwelle zählt.

## Warnungen

Protokollprüfung (`findeAuffaelligkeiten`): Laktatabfall > 0,5 mmol/L bei steigender Last
(einstellbar), HF-Abfall > 5/min, unplausible Werte, wenige Stufen, kurze oder uneinheitliche
Stufen, erhöhtes Ruhelaktat, Maximallaktat < 4 mmol/L. Kurve: R² < 0,95, einzelne Messwerte
weit neben der Kurve, Polynom fällt am Ende oder wird negativ. Modelle: Schwelle nicht
erreicht, Schwelle am Rand des Messbereichs, kein Knick oder Anstieg.

Die Daten bleiben unverändert. Ob eine Stufe als Ausreißer gilt, entscheidet der Coach.

## Zonen

`berechneZonen(modell, { lt1, lt2 }, { einheit, stufen })` liefert Leistung bzw.
Geschwindigkeit, bei km/h zusätzlich die Pace (s/km), und die Herzfrequenz. Die HF-Grenzen
werden an den Intensitätsgrenzen aus den Stufen interpoliert. Außerhalb der Stufen werden sie
fortgeschrieben und dann mit `hfExtrapoliert` markiert. Ein Zonenmodell besteht aus Grenzen
relativ zu LT1/LT2 (`{ anker: 'LT2', faktor: 0.95 }`, `{ anker: 'LT1-LT2', anteil: 0.5 }`).

Vorlagen: `DREI_ZONEN` (an LT1/LT2), `FUENF_ZONEN`, `SIEBEN_ZONEN`. Die Grenzen der 5- und
7-Zonen-Vorlage sind **Platzhalter** und müssen fachlich festgelegt werden.

## Versionen und Golden-Tests

- `src/versionen.ts` führt `ENGINE_VERSION`, je Modellfamilie eine `modellVersion` und je Kurve
  eine Version.
- **Jede Änderung, die die Ausgabe eines Modells ändert, erhöht dessen Version.** Das gilt auch,
  wenn die Änderung aus einer gemeinsamen Hilfsfunktion kommt.
- `test/golden/*.json` hält die Ausgabe aller Modelle auf allen drei Kurven für jede Fixture fest.
  Der Golden-Test schlägt fehl, wenn sich Werte ändern, ohne dass die Version steigt.
  `npm run golden:update` verweigert in diesem Fall das Schreiben.
- Ablauf bei einer Modelländerung: Code ändern → Version erhöhen → `npm run golden:update` →
  Diff der Golden-Dateien prüfen → committen.

Die Golden-Werte wurden beim Anlegen unabhängig mit numpy/scipy nachgerechnet (polyfit,
curve_fit, brentq, Rastersuche). Die Abweichung lag für alle Modelle unter 0,01 W bzw. km/h.

### Referenzwerte aus WinLactat/Ergonizer

Jede Fixture in `test/fixtures/` hat einen Block `referenz`:

```json
"referenz": {
  "quelle": "WinLactat 6.2",
  "kurve": "polynom3",
  "toleranz": { "wert": 3, "hf": 2, "laktat": 0.1 },
  "werte": { "fest-4": { "wert": 312, "hf": 166 }, "dickhuth-ias": { "wert": 281 } }
}
```

Sobald `werte` gefüllt ist, prüft der Test die Engine gegen diese Werte innerhalb der Toleranz.
Neue Fixtures: JSON-Datei in `test/fixtures/` anlegen, dann `npm run golden:update`.
