# intervals-coach

Browser-App, die auf Basis der letzten Trainingseinheiten aus intervals.icu die nächsten
drei Tage plant. Jeder Tag zeigt **jede gewählte Sportart** (Rad, Lauf, Schwimmen) als
gleichwertige Alternative plus eine Empfehlung, welche davon heute am meisten bringt —
und jede Einheit zusätzlich als Kurzfassung, falls der Tag knapper wird als gedacht.

Der Plan hält sich an das, was tatsächlich passiert ist: eine andere Sportart, eine
ausgefallene Woche oder ein spontaner harter Tag verschieben ihn, statt ihn zu brechen.

## Setup

```bash
cp .env.example .env       # API-Key + Athlete-ID eintragen
npm install
npm run dev                # API :8787, UI :5173
```

API-Key: intervals.icu → Settings → Developer → API Key.
Athlete-ID: steht in der URL der Settings-Seite (`i123456`).

`npm run dev` startet den Node-Server für lokale Entwicklung (Hot Reload der UI).
Produktiv läuft die App als Cloudflare Worker, siehe unten.

## Deployment (Cloudflare Workers)

Die App ist von überall erreichbar, kostenlos im Free-Tier, und komplett hinter einem
Passwort. Einmalig:

```bash
npx wrangler login
npx wrangler kv namespace create COACH_CONFIG   # ID in wrangler.jsonc eintragen
npx wrangler secret put INTERVALS_API_KEY
npx wrangler secret put INTERVALS_ATHLETE_ID
npx wrangler secret put APP_PASSWORD            # frei wählbar, lang
npm run deploy
```

Danach liegt die App auf `https://intervals-coach.<dein-subdomain>.workers.dev`.
Jedes weitere Deployment ist nur noch `npm run deploy`.

**Zugangsschutz:** die App fragt beim ersten Aufruf nach `APP_PASSWORD` und tauscht es
gegen ein Sitzungs-Cookie (30 Tage, gleitend verlängert — siehe *Sitzungen* unten). Ohne
gültiges Cookie liefert keine `/api/`-Route Daten. Das ist kein Komfort-Feature: der
intervals.icu-API-Key hat Vollzugriff auf den Account, eine ungeschützte URL würde ihn
effektiv weiterreichen. Öffentlich erreichbar sind nur die Programmdateien der Oberfläche
und die Rechtstexte — beide enthalten keine Daten und keine Zugangsdaten.

Zehn Fehlversuche pro IP-Adresse sperren die Anmeldung für 15 Minuten. Das Passwort wird
in konstanter Zeit verglichen, landet nie im Browser-Speicher und wird bei jedem Aufruf
neu gegen das Secret geprüft. `APP_USER` wird nicht mehr gebraucht.

**Deployment per GitHub Actions:** `.github/workflows/deploy.yml` fährt auf jedem Pull
Request Tests und Build, und bei jedem Push auf `main` zusätzlich `wrangler deploy` — ein
roter Test hält das Deployment auf. Dafür braucht das Repository zwei Secrets unter
*Settings → Secrets and variables → Actions*:

| Secret | Woher |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare-Dashboard, rechts in der Übersicht des Accounts |

Der Token braucht nur Workers-Rechte: Schreibzugriff auf Workers Scripts und den
KV-Namespace, sonst nichts. Ein Deployment von Hand bleibt jederzeit möglich
(`npm run deploy`), und im Actions-Tab lässt sich der Workflow über *Run workflow* auch
ohne Commit auslösen.

**Worker lokal testen:** `cp .dev.vars.example .dev.vars`, ausfüllen, dann `npm run cf`.
`.dev.vars` ist gitignored.

**Konfiguration in Produktion:** `config/athlete.json` gibt es im Worker nicht — die
Konfiguration liegt in Workers KV unter dem Schlüssel `athlete-config` und wird beim
ersten Aufruf aus den Defaults angelegt. Bearbeitet wird sie wie lokal über die
Einstellungen in der App.

## Wie geplant wird

1. **Zustand** — 180 Tage Aktivitäten und 60 Tage Wellness werden geladen. Daraus
   entstehen CTL/ATL/TSB gesamt und je Sportart, Abstand zur letzten harten Einheit,
   Rampenrate und ein Readiness-Score aus HRV-, Ruhepuls-, Schlaf- und Formabweichung
   gegenüber der 30-Tage-Baseline.
2. **Phase** — aus dem nächstliegenden Ziel: >10 Wochen Grundlage, 10–5 Aufbau,
   4–2 spezifisch, letzte Woche Tapering. Jede vierte Woche ab `planStart` ist
   Erholungswoche. Ziele ohne Datum durchlaufen 4-Wochen-Blöcke Grundlage/Aufbau.
3. **Tagestyp** — Regeln in dieser Reihenfolge: Readiness rot → Regeneration/Ruhe;
   Form < −30 → Regeneration; weniger als 48 h seit der letzten harten Einheit → locker;
   Wochenbudget harter Einheiten erschöpft → locker; sonst Qualitätstag. Nach zwei vollen
   Ruhetagen kippt die Budgetregel: ist die Form gut, wird trotzdem eine Qualitätseinheit
   angeboten — als freiwillig markiert, nicht eingeplant. Drei Ruhetage am Stück kann der
   Plan nicht vorschlagen, das wäre Formverlust statt Erholung.
4. **Auswahl** — pro Sportart wird aus der Workout-Bibliothek der Reiz gewählt, der am
   längsten zurückliegt, zur Phase passt und ins Zeitbudget fällt. Zuletzt absolvierte
   und bereits vorgeschlagene Workouts werden abgewertet, damit sich nichts wiederholt.
5. **Simulation** — Tag 2 und 3 werden auf Basis der für Tag 1 empfohlenen Einheit
   gerechnet, damit nie zwei harte Tage hintereinander stehen.

Das Wochenbudget harter Einheiten leitet sich aus `weeklySessions` ab: bei drei Einheiten
pro Woche zwei Qualitätseinheiten plus eine lockere oder lange. Die Obergrenze bestimmt,
was *eingeplant* wird — nicht, was der Körper verträgt: alles darüber erscheint weiter,
nur als freiwillig markiert.

**Reiz-Erkennung.** Ob eine vergangene Einheit hart war, entscheidet die Zeit in den
Zonen, nicht die Durchschnittsintensität — ein Intervalltraining hat über die ganze
Einheit gemittelt oft nur 85 %, enthält aber 25 Minuten an der Schwelle. Ohne die
Zonenauswertung würden genau die Einheiten übersehen, die zählen.

**Heute anders.** Über „Heute hart / locker / Pause“ lässt sich der Tagestyp überschreiben.
Der Wunsch gilt nur für heute; was er kostet, rechnen die Folgetage mit ein.

**Längere Pausen** — Krankheit, Impfung, Verletzung oder schlicht keine Zeit — werden
eingetragen und schlagen jede Messung: eine Impfreaktion zeigt sich in der HRV erst, wenn
die Einheit längst gelaufen ist. Solange die Pause läuft, plant der Coach nichts Hartes,
zeigt Lockeres nur als freiwillig an und zählt die Woche nicht als verpasst. Wie lange gar
nichts vorgeschlagen wird und wie lange danach die Intensität zurückgehalten wird, hängt
vom Grund ab: bei Krankheit drei Tage nichts und eine Woche Rücksicht danach, bei einer
Impfung zwei Tage und drei. Wer früher wieder fit ist, beendet die Pause mit einem Klick.

## Drei Zeitfenster statt einer Obergrenze

Eine Zahl war nie die Wahrheit. Konfiguriert werden drei: die Zeit, die **immer** geht,
die **normale** und die für einen **guten Tag**. Jede Einheit wird in allen dreien
angeboten; vorausgewählt ist die normale.

Die Bibliothek wird bis zur Obergrenze durchsucht, damit auch die langen Einheiten
erreichbar bleiben — die kürzeren Fassungen entstehen daraus. Was gekürzt wird, hängt am
Reiz: Intervalltrainings behalten Intervalllänge und Zielwerte und verlieren
Wiederholungen, Dauerbelastungen werden schlicht kürzer — dort *ist* die Dauer der Reiz.
Auf- und Auswärmen geht zuerst.

Vier Regeln halten das ehrlich: nichts verliert mehr als die Hälfte von sich; eine Einheit
wird nie gestreckt, nur getrimmt; zwei Fassungen, die weniger als zwölf Minuten
auseinanderliegen, sind dieselbe Einheit und werden zu einer; und Referenzeinheiten
werden gar nicht gekürzt, weil sie sonst nicht mehr mit sich selbst vergleichbar wären.
Eine gekürzte Fassung schaltet keine Progressionsstufe frei.

## Progression, Kraft, Benchmarks

**Stufen.** Workouts gehören zu Familien (`bike-threshold`, `run-vo2`, …). Die nächste
Stufe wird frei, wenn die vorige ganz absolviert wurde: mit mindestens 75 % Compliance, falls
sie als Kalendereintrag gepaart ist, sonst wenn die Aktivität genau den Reiz der Einheit
geliefert hat.

**Erkennen ohne Kalender.** Die App merkt sich, was sie an jedem Tag angeboten hat — jede
Option, die zu sehen war, auch nach einem Wunsch nach „härter" oder „lockerer". Eine
Aktivität gilt als diese Einheit, wenn Sportart und Tag stimmen, die Dauer zwischen 40 % und
150 % liegt und der Reiz passt: *genau*, wenn der Reiz der Einheit in den Zonen steckt,
*ähnlich*, wenn nur die Härte passt. Ähnlich reicht für „erledigt" und den Verlauf, nicht
für Progression. Tests und Referenzeinheiten brauchen immer den genauen Reiz; ein erkannter
Test zählt nur, wenn ein durchgehaltener Block darin steckt und das Ergebnis nicht mehr als
3 % unter dem eingestellten Wert liegt — sonst war es eine normale Schwelleneinheit. Ein
gepaarter Kalendereintrag bleibt der direktere Beleg und gewinnt.

**Heute bleibt heute.** Der Vorschlag für heute wird aus dem Stand vor der ersten Einheit
des Tages berechnet und springt nicht um, sobald sie synchronisiert ist. Die Einheit wird
als erledigt markiert; zählen tut sie ab morgen, dort mit dem, was tatsächlich trainiert
wurde.

**Krafttraining** erscheint optional an geeigneten Tagen (nie am Tag vor einer harten
Einheit) und passt sich an die vorhandene Ausrüstung an: Studio, Kurzhanteln bis 10 kg
oder nur Körpergewicht. Ohne Gewichte übernehmen einbeinige Arbeit, langsame Absenkphasen
und Plyometrie die Rolle der Last.

**Formkontrolle.** Alle 8 Wochen legt die App dieselbe Referenzeinheit (4×4 min) auf einen
Qualitätstag — unverändert, damit die Ergebnisse vergleichbar bleiben. Verglichen wird
Leistung gegen Herzfrequenz: weniger Schläge für dieselbe Arbeit ist der Fortschritt. Sie
setzt keine Werte und kostet keinen maximalen Test; das ist Aufgabe der Standortbestimmung.
Nicht in Tapering- oder Erholungswochen, nicht über dem Zeitbudget, nicht direkt nach einer
Pause und nie am selben Tag wie ein Schwellentest.

**Standortbestimmung.** Jede Schätzung einer Schwelle ist durch das begrenzt, was der
Athlet versucht hat: Intervalle belegen eine Untergrenze, nie eine Obergrenze. Wer gut
trainiert, aber nie testet, sieht seinen Schätzwert deshalb sinken — und bekommt dann zu
leichte Vorgaben, die den nächsten Schätzwert weiter drücken. Die App plant den Ausweg
selbst ein: einen 20-Minuten-Maximalblock, alle 10 Wochen und immer auf einem Qualitätstag.
Nicht in Tapering- oder Erholungswochen, nicht bei Form unter −15, nicht direkt nach einer
Pause, nie über dem angegebenen Zeitbudget und höchstens einmal pro Woche.

**Danach** liest die App das Ergebnis selbst aus: sie holt die Intervalle der absolvierten
Einheit, nimmt den längsten Block ab 15 Minuten und rechnet daraus die Schwelle — 95 % der
Durchschnittsleistung beim Rad, 5 % langsamer als die Testpace beim Laufen. Der Vorschlag
sagt dann „gemessen, nicht geschätzt" und schlägt jeden Schätzwert für dieselbe Sportart.
Übernehmen schreibt den Wert auch nach intervals.icu zurück. Ist kein durchgehaltener Block
in der Einheit, wird nichts hineingelesen — dann war es kein Test.

**Schwellenwerte.** Weichen die in intervals.icu beobachteten Werte von den eingestellten
ab, schlägt die App eine Korrektur vor — Zuwächse ab 3 %, Rückgänge erst ab 6 %. Eine
Schätzung beweist eine Untergrenze, nie eine Obergrenze: dass eine Leistung *nicht*
erreicht wurde, kann auch heißen, dass sie nie versucht wurde. Übernommene Werte werden
nach intervals.icu zurückgeschrieben (`ftp` und `indoor_ftp` gemeinsam).

## Ziele

Gerechnet wird von heute bis zum Stichtag, nicht vom Wert bei Planstart: Ausgangspunkt ist,
was jetzt gemessen ist — die FTP aus dem Profil, die Zielzeit aus der Schwellenpace über
Riegel (`T = 3600 × (D / D₆₀)^1,06`) hochgerechnet. Daraus folgt, was pro Woche nötig wäre
(+W/Woche bzw. Sekunden/Woche) und wie das zu realistischen Zuwächsen steht: 2,5 % FTP pro
Monat, 0,8 % Rennzeit pro Monat. Zu viel verlangt heißt „ambitioniert", das Doppelte davon
„nicht realistisch". Für 10 km kommt die Laufhäufigkeit als eigener Engpass dazu.

## Zwift Racing League

Eine Runde wird einmal eingetragen (Einstellungen → Zwift Racing League): pro Dienstag
Format — Scratch, Punkterennen, Mannschaftszeitfahren, Race of Truth — sowie Route und
Runden, sobald WTRL sie veröffentlicht. Routen, Distanzen und Höhenmeter kommen aus
[`zwift-data`](https://github.com/andipaetzold/zwift-data) (MIT); eine offizielle
Schnittstelle für Rennplan oder Anmeldung gibt es nicht, deshalb weiß die App nie, ob
jemand wirklich startet.

Der Plan ist für beide Ausgänge gebaut. Der Renntag ist ein Qualitätstag: das Rennen steht
zuerst, daneben je eine harte Alternative, die die Woche genauso hält. Der Tag davor ist
locker mit kurzen Antritten auf dem Rad. Keine Standortbestimmung am Renntag oder am Tag
davor, kein Krafttraining am Renntag. Eine eingetragene Pause, die heute noch läuft, geht
vor; in der Erholungswoche wird das Rennen nur freiwillig und nach einer lockeren
Alternative angeboten; bei roten Erholungswerten bleibt die Entscheidung des Plans stehen.
Ein eigener Wunsch („Heute locker") gewinnt immer.

**Belastung.** Veröffentlichte Werte je Format gibt es nicht, also schätzt die App aus den
eigenen Rennen der letzten Saison (am Aktivitätsnamen „Zwift Racing League" erkannt):
Median-IF je Art — Massenstart oder Zeitfahren; Race of Truth wie Zeitfahren, bis zwei
eigene vorliegen —, Geschwindigkeit aus einer Geraden über Höhenmeter pro Kilometer,
Streckenlänge aus Route × Runden + Anfahrt + 2,75 km (so viel länger war die Aufzeichnung
im Median als die Strecke), dazu 20 Minuten Aufwärmen. Mit weniger als zwei eigenen Rennen
oder ohne Route heißt die Schätzung „grob". Ein gefahrenes Rennen zählt als harte Einheit,
schaltet aber nie eine Progressionsstufe frei und erscheint im Verlauf als Rennen.

## Workouts in den Kalender

Optional, nur um eine Einheit auf Rolle oder Uhr zu bekommen — erkannt wird Training auch
ohne. Jede Fassung einer Einheit lässt sich einzeln senden, auch alle nebeneinander, wenn
noch offen ist, was der Tag hergibt. Dieselbe Fassung am selben Tag landet nur einmal im
Kalender; die Dauer steht dafür in der `external_id` (`coach:<datum>:<vorlage>:<minuten>`).
Der Server erzeugt ein `WORKOUT`-Event mit Beschreibung in intervals.icu-Syntax.
Zielangaben sind Prozentwerte von FTP bzw. Schwellenpace, damit intervals.icu immer mit
den dort hinterlegten Werten rechnet; die App zeigt zusätzlich die absoluten Watt- und
Pace-Bereiche an.

**Zielgeräte je Sportart.** intervals.icu leitet je Konto weiter, nicht je Einheit — es gibt
dort nur einen Schalter pro Plattform. Die App hält die Zuordnung deshalb selbst (Laufen →
Garmin, Rad → Zwift und Wahoo, beliebig kombinierbar) und stellt die Schalter unmittelbar
vor jedem Senden auf die Sportart der Einheit um. Eine Sportart ohne Zuordnung bleibt
unangetastet. Geschrieben wird immer nur das einzelne Feld: ein PUT mit dem kompletten
Athletenprofil lehnt intervals.icu mit 403 ab.

## Darstellung

Hell, dunkel oder nach Systemeinstellung, umschaltbar in der Kopfzeile jeder Ansicht. Die
Wahl liegt im `localStorage` und wird vor dem ersten Rendern angewendet, damit die Seite
nie kurz im falschen Modus aufblitzt. Die Schriften (IBM Plex Mono und Sans Condensed)
sind mit ausgeliefert und werden nicht von Google geladen — bei Gesundheitsdaten auf der
Seite wäre die Übertragung der Besucher-IP an Dritte nicht vertretbar.

## Mehrbenutzer-Betrieb

Die App kennt zwei Modi und schaltet automatisch um:

| | Einzelbetrieb | Mehrbenutzer |
|---|---|---|
| Aktiv wenn | `INTERVALS_API_KEY` gesetzt | `INTERVALS_CLIENT_ID`, `INTERVALS_CLIENT_SECRET`, `SESSION_SECRET` gesetzt |
| Zugang | ein gemeinsames Passwort, dann Sitzungs-Cookie | „Mit intervals.icu anmelden" (OAuth) |
| Zugangsdaten | ein persönlicher API-Key im Secret | pro Nutzer ein OAuth-Token, verschlüsselt in KV |
| Konfiguration | ein Datensatz | ein Datensatz je Athlet |

intervals.icu verlangt für Apps mit mehreren Nutzern ausdrücklich OAuth. Der Client muss
per Mail bei `david@intervals.icu` beantragt werden — mit App-Name, Beschreibung,
Website-URL, quadratischem Logo (≥128 px), Datenschutz-URL und den Redirect-URIs.
`http://localhost/` ist immer erlaubt, der Flow lässt sich also vor der Freigabe testen.

Angefragte Scopes: `ACTIVITY:READ WELLNESS:READ CALENDAR:WRITE` — lesen und Einheiten
planen, nichts löschen.

Sobald der Client da ist:

```bash
npx wrangler secret put INTERVALS_CLIENT_ID
npx wrangler secret put INTERVALS_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET      # z. B. openssl rand -base64 32
npm run deploy
```

Der Redirect-URI wird aus der Request-Origin abgeleitet, dieselbe Codebasis funktioniert
also unter `localhost` und in Produktion. Solange `INTERVALS_CLIENT_ID` fehlt, bleibt der
Einzelbetrieb unverändert aktiv — ein bestehendes Deployment bricht nicht.

**Gespeichert wird:** OAuth-Token (AES-GCM-verschlüsselt mit `SESSION_SECRET`) und die
Zielkonfiguration je Athlet. Trainings- und Gesundheitsdaten werden bei jedem Aufruf frisch
von intervals.icu geholt und nicht abgelegt.

**Sitzungen:** in beiden Modi dasselbe HMAC-signierte Cookie — `HttpOnly` (für
JavaScript unsichtbar, also auch für fremdes), `Secure`, `SameSite=Lax` (kein Versand bei
Anfragen von fremden Seiten), `Path=/`, 30 Tage Laufzeit. Es enthält nur Athlet und
Ablaufzeitpunkt; ohne gültige Signatur ist es wertlos. Jeder Aufruf schiebt den Ablauf
wieder auf 30 Tage vor (höchstens einmal täglich neu gesetzt), eine Sitzung ohne Nutzung
endet also nach einem Monat von selbst. „Abmelden" löscht das Cookie sofort.

Signiert wird im Mehrbenutzer-Betrieb mit `SESSION_SECRET`. Im Einzelbetrieb genügt
`APP_PASSWORD` als Schlüssel — eine Passwortänderung beendet dadurch alle Sitzungen.
Optional lässt sich auch dort `SESSION_SECRET` setzen, dann überleben Sitzungen den
Passwortwechsel. Der OAuth-`state` läuft über ein eigenes kurzlebiges Cookie gegen CSRF.

**Rechtliches:** HRV, Ruhepuls und Schlaf sind Gesundheitsdaten nach Art. 9 DSGVO.
`/datenschutz` und `/impressum` liegen als Entwurf bei und müssen vor der Veröffentlichung
mit echten Angaben gefüllt werden.

## Soll und Ist

Unter jeder erkannten Einheit steht der Soll-Ist-Vergleich. Liefert intervals.icu die Streams
(Leistung, beim Laufen Tempo, dazu Puls), zeichnet die Karte den **Verlauf**: die Kurve über den
Zielkorridoren, gefüllt dort, wo sie im Korridor lag, der Puls als eigener Streifen darunter. Der
Worker dampft die Streams auf höchstens 720 Punkte ein (Rad 10-s-, Lauf 30-s-Mittel). Ohne
Streams — Becken, keine Leistungsmessung, Intervalle ohne Position — bleibt der Blockstreifen.
„Bild teilen“ zeichnet dieselbe Ansicht als 1080 × 1080-PNG fürs Teilen-Menü des Handys.

## Struktur

```
src/coach/     reine Trainingslogik, ohne IO — hier liegt die gesamte Fachlichkeit
  fitness.ts   CTL/ATL/TSB, Reiz-Erkennung aus vergangenen Aktivitäten
  readiness.ts HRV-, Ruhepuls-, Schlaf- und Form-Flags gegen die 30-Tage-Baseline
  phase.ts     Periodisierung und Wochenbudget
  library.ts   Workout-Bibliothek (Rad, Lauf, Schwimmen) und Kraftübungen
  variant.ts   leitet aus jeder Einheit die Kurzfassung ab
  engine.ts    Regel-Engine für die nächsten Tage
  progression.ts  Stufen je Workout-Familie, aus tatsächlich absolvierten Einheiten
  adherence.ts absolviert, getauscht, ausgefallen — die letzten sieben Tage
  benchmark.ts Referenzeinheit alle acht Wochen
  threshold-drift.ts  Abgleich der Schwellenwerte mit intervals.icu
  config-schema.ts    Validierung und Migration der gespeicherten Konfiguration
  feasibility.ts  Realismus-Check der Ziele
server/        intervals.icu-Client, HTTP-Routen, Node-Entry für die Entwicklung
worker/        Cloudflare-Worker-Entry
  oauth.ts     intervals.icu OAuth: Authorize-URL, Code-Tausch, Refresh
  session.ts   signierte Session-Cookies, OAuth-state
  login-throttle.ts  Fehlversuche pro IP, 15-Minuten-Fenster
  crypto.ts    HMAC-Signatur und AES-GCM-Verschlüsselung (Web Crypto)
  users.ts     Nutzer- und Konfigurationsspeicher in KV, je Athlet
src/ui/        React-Oberfläche
  styles/      Designrichtung „Messgerät“, Tokens für hell und dunkel
  theme.ts     Moduswahl, gespeichert je Browser
tests/         Vitest (npm test)
scripts/demo.ts  Plan aus synthetischen Daten, läuft ohne API-Zugang
```

## Konfiguration

`config/athlete.json` wird beim ersten Start angelegt und ist über die Einstellungen in
der App editierbar (FTP, Schwellenpace, Gewicht, Einheiten pro Woche, Zeitbudget, Ziele
mit optionalem Zieldatum). „FTP & Pace von intervals.icu holen“ übernimmt die Werte aus
den dortigen Sport-Settings.

Einstellbar sind außerdem die trainierten Sportarten samt Schwellenwert je Sportart, die
Ausrüstung fürs Krafttraining und ein Bereich statt einer festen Zahl an Einheiten pro
Woche (`min`/`max`).

## Lizenz

**Alle Rechte vorbehalten.** Der Quellcode ist einsehbar, aber nicht zur Nutzung,
Vervielfältigung oder Abwandlung freigegeben. Ohne ausdrückliche Lizenz gilt das
gesetzliche Urheberrecht.
