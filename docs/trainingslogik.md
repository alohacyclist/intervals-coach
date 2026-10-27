# Trainingslogik

Nach welchen Regeln der Plan entscheidet und warum. Geschrieben, damit ein Trainer oder
Sportwissenschaftler sie prüfen kann, ohne den Code zu lesen. Jede Regel sagt dazu, wie fest
ihr Grund ist: **belegt** (Forschungslage eindeutig), **Praxis** (übliche Trainerpraxis,
plausibel, aber nicht als Regel belegt) oder **Annahme** (eine Festlegung dieser App).

Die genannten Quellen sind aus dem Gedächtnis zitiert und vor einer Weitergabe zu prüfen.

## Leitgedanke

Die App plant auf ein Ziel hin, ausgehend vom aktuellen Stand — nicht von einem Wochenplan,
der eingehalten werden muss. Was tatsächlich trainiert wurde, ersetzt sofort den Vorschlag.
Verpasste Einheiten werden nicht nachgejagt: Ist die Woche noch nicht voll, wandert die
Qualität auf den nächsten passenden Tag; ist sie voll, verfällt sie.

## 1. Wie viel hart, wie viel locker

| Einheiten pro Woche | harte Einheiten höchstens |
|---|---|
| 1–2 | 1 |
| 3–5 | 2 |
| ab 6 | 3 |

Dazu je Phase eine Obergrenze: Grundlage 2, Aufbau und spezifisch 3, Tapering 2,
Erholungswoche 1. Es gilt die kleinere Zahl.

- **Belegt:** Ausdauersportler aller Niveaus trainieren den Großteil ihrer Zeit locker
  (etwa 80/20 nach Zeit). Seiler & Kjerland 2006; Stöggl & Sperlich 2014.
- **Praxis:** Bei wenigen Einheiten pro Woche dürfen die harten einen größeren Anteil
  haben. Mindestens eine lockere oder lange Einheit bleibt die Basis.
- **Geändert:** Bisher waren bei 4–5 Einheiten drei harte möglich, also über die Hälfte.

## 2. Abstand zwischen harten Einheiten

- **48 h** zwischen zwei harten Einheiten, egal welche Sportart. **Praxis**: Hart-locker-
  Prinzip; Herz-Kreislauf und Stoffwechsel sind danach meist wieder bereit.
- **72 h** zwischen zwei harten Läufen. **Praxis/Annahme**: Laufen belastet Sehnen und
  Knochen durch den Aufprall; sie passen sich langsamer an als der Kreislauf. Eher
  vorsichtig — viele Pläne kommen mit 48 h aus.
- Der Tag nach einer harten Einheit ist ein Ruhetag, solange die restlichen Einheiten der
  Woche noch Platz haben, sonst ein lockerer Tag. **Annahme**: Das folgt aus dem
  Wochenpensum, nicht aus der Physiologie.

## 3. Welche Sportart den harten Tag bekommt

1. **Ein Ziel in seinen letzten vier Wochen** (spezifische Phase, Tapering): alle harten
   Tage gehören seiner Sportart. Braucht der Lauf noch seine 72 h, bleibt der Tag locker,
   statt die Qualität aufs Rad zu geben.
2. **Sonst** bekommt die Sportart mit Ziel den harten Tag. Haben zwei Sportarten ein Ziel,
   wechseln sie sich ab; zuerst die, die diese Woche noch keine harte Einheit hatte.
3. **Ohne Ziel** kommt jede Sportart reihum dran.
4. Braucht die Zielsportart noch Erholung (Lauf unter 72 h), darf außerhalb der letzten
   vier Wochen eine andere Sportart den Tag nehmen.

- **Belegt:** Spezifität — Training wirkt am stärksten auf das, was trainiert wird.
  Querübertragung (Rad ↔ Lauf) gibt es für die aerobe Basis, weniger für Tempo und
  Ökonomie.
- **Geändert:** Bisher bekam immer die Sportart ohne harte Einheit in der Woche den
  nächsten harten Tag, auch wenn das Ziel in der anderen lag.

## 4. Wiedereinstieg nach einer Lücke

Ab **10 Tagen ohne Training** erkennt der Plan eine Lücke selbst, auch ohne eingetragene
Pause. Der Weg zurück dauert etwa so lange wie die Lücke, höchstens 4 Wochen:

1. die ersten **2 Einheiten locker**,
2. danach höchstens **1 harte Einheit pro Woche**,
3. **Schwelle vor VO₂max**, kein Schwellentest.

- **Belegt:** Nach 2–4 Wochen ohne Training sinken Blutvolumen und VO₂max messbar.
  Mujika & Padilla 2000.
- **Praxis:** Erst Häufigkeit und Umfang, dann Intensität. Sehnen und Knochen brauchen
  regelmäßige Belastung, bevor sie Spitzen vertragen.
- **Annahme:** Die genauen Zahlen (10 Tage, 2 Einheiten, Dauer wie die Lücke).
- **Geändert:** Bisher wurde nur am ersten Tag nach der Lücke VO₂max vermieden; danach lief
  der Plan normal weiter.

Eingetragene Pausen (Krankheit, Impfung, Verletzung) haben zusätzlich eigene Regeln, siehe
README.

## 5. Erholungswerte

HRV, Ruhepuls, Schlaf, subjektive Müdigkeit und Form (TSB) werden mit der eigenen
30-Tage-Baseline verglichen. Mehr als eine Standardabweichung schlechter → heute locker,
deutlich schlechter oder zwei Warnzeichen → Regeneration oder Pause.

- **Belegt:** HRV-gesteuertes Training ist mindestens so wirksam wie ein fester Plan.
  Kiviniemi et al. 2007.
- **Belegt (Modell):** CTL/ATL/TSB nach dem Fitness-Ermüdungs-Modell von Banister et al. 1975.
  Als Modell nützlich, als Vorhersage für Einzelne ungenau.

## 6. Phasen

Mehr als 10 Wochen bis zum Ziel: Grundlage; 10–5: Aufbau; 4–2: spezifisch; letzte Woche:
Tapering. Jede vierte Woche ist Erholungswoche. Die Phase gewichtet, welche Reize gewählt
werden (Grundlage: Sweetspot, Tempo, lange Einheiten; Aufbau: VO₂max, Schwelle; spezifisch:
Schwelle, Wettkampftempo).

- **Praxis:** Klassische lineare Periodisierung mit 3:1-Rhythmus.

## Offene Punkte

Bewusst noch nicht geändert, aber fachlich fraglich:

- **Tapering ist eine Woche lang.** Die Meta-Analyse von Bosquet et al. 2007 spricht eher
  für 8–14 Tage: Umfang deutlich senken, Intensität und Häufigkeit halten.
- **Schwimmen zählt als volle harte Einheit** im Wochenbudget, obwohl es Beine und
  Bewegungsapparat kaum belastet.
- **Eine lange Einheit pro Woche** ist nicht garantiert; sie entsteht nur über die
  Reizrotation. Für Lauf- und Langdistanzziele ist sie eine Kernsäule.
- **Rampenrate** (CTL-Anstieg pro Woche) erzeugt nur einen Hinweis, bremst den Plan aber
  nicht.
- **Ruhetag statt lockerer Tag** nach harten Einheiten: siehe Abschnitt 2.

## Quellen

- Banister EW, Calvert TW, Savage MV, Bach T (1975). A systems model of training for
  athletic performance. *Australian Journal of Sports Medicine*.
- Bosquet L, Montpetit J, Arvisais D, Mujika I (2007). Effects of tapering on performance:
  a meta-analysis. *Medicine & Science in Sports & Exercise*.
- Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP (2007). Endurance training guided
  individually by daily heart rate variability measurements. *European Journal of Applied
  Physiology*.
- Mujika I, Padilla S (2000). Detraining: loss of training-induced physiological and
  performance adaptations. Part I and II. *Sports Medicine*.
- Seiler KS, Kjerland GØ (2006). Quantifying training intensity distribution in elite
  endurance athletes: is there evidence for an "optimal" distribution? *Scandinavian
  Journal of Medicine & Science in Sports*.
- Stöggl T, Sperlich B (2014). Polarized training has greater impact on key endurance
  variables than threshold, high intensity, or high volume training. *Frontiers in
  Physiology*.
