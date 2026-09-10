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

**Zugangsschutz:** der Worker verlangt Basic Auth für *alles*, auch für die statischen
Dateien — Benutzername `coach` (per Secret `APP_USER` änderbar), Passwort `APP_PASSWORD`.
Das ist kein Komfort-Feature: der intervals.icu-API-Key hat Vollzugriff auf den Account,
eine ungeschützte URL würde ihn effektiv weiterreichen.

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
Stufe wird frei, wenn die vorige mit mindestens 75 % Compliance absolviert wurde — belegt
über die Verknüpfung von Kalendereintrag und tatsächlicher Aktivität, nicht über den Plan.

**Krafttraining** erscheint optional an geeigneten Tagen (nie am Tag vor einer harten
Einheit) und passt sich an die vorhandene Ausrüstung an: Studio, Kurzhanteln bis 10 kg
oder nur Körpergewicht. Ohne Gewichte übernehmen einbeinige Arbeit, langsame Absenkphasen
und Plyometrie die Rolle der Last.

**Benchmarks.** Alle 8 Wochen schlägt die App eine feste Referenzeinheit vor (4×4 min),
immer unverändert, damit die Ergebnisse vergleichbar bleiben. Verglichen wird Leistung
gegen Herzfrequenz.

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

## Workouts in den Kalender

Jede Einheit hat einen Button „→ intervals.icu Kalender“. Der Server erzeugt ein
`WORKOUT`-Event mit Beschreibung in intervals.icu-Syntax — von dort synchronisiert es
auf Rolle bzw. Uhr. Zielangaben sind Prozentwerte von FTP bzw. Schwellenpace, damit
intervals.icu immer mit den dort hinterlegten Werten rechnet; die App zeigt zusätzlich
die absoluten Watt- und Pace-Bereiche an.

**Zielgeräte** (Garmin Connect, Wahoo, Zwift) lassen sich direkt in der App schalten. Die
Weiterleitung macht intervals.icu selbst; die App setzt nur die entsprechenden Flags am
Athletenprofil.

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
| Zugang | ein gemeinsames Passwort (Basic Auth) | „Mit intervals.icu anmelden" (OAuth) |
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

**Sitzungen:** HMAC-signiertes Cookie, `HttpOnly`, `Secure`, `SameSite=Lax`, 30 Tage.
Der OAuth-`state` läuft über ein eigenes kurzlebiges Cookie gegen CSRF.

**Rechtliches:** HRV, Ruhepuls und Schlaf sind Gesundheitsdaten nach Art. 9 DSGVO.
`/datenschutz` und `/impressum` liegen als Entwurf bei und müssen vor der Veröffentlichung
mit echten Angaben gefüllt werden.

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
