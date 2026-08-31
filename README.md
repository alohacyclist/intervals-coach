# intervals-coach

Browser-App, die auf Basis der letzten Trainingseinheiten aus intervals.icu die nächsten
drei Tage plant. Jeder Tag zeigt **eine Rad- und eine Laufeinheit** als gleichwertige
Alternativen plus eine Empfehlung, welche der beiden heute mehr bringt.

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
   Wochenbudget harter Einheiten erschöpft → locker; sonst Qualitätstag.
4. **Auswahl** — pro Sportart wird aus der Workout-Bibliothek der Reiz gewählt, der am
   längsten zurückliegt, zur Phase passt und ins Zeitbudget fällt. Zuletzt absolvierte
   und bereits vorgeschlagene Workouts werden abgewertet, damit sich nichts wiederholt.
5. **Simulation** — Tag 2 und 3 werden auf Basis der für Tag 1 empfohlenen Einheit
   gerechnet, damit nie zwei harte Tage hintereinander stehen.

Das Wochenbudget harter Einheiten ist auf `weeklySessions − 1` gedeckelt: bei drei
Einheiten pro Woche also zwei Qualitätseinheiten plus eine lockere oder lange.

## Workouts in den Kalender

Jede Einheit hat einen Button „→ intervals.icu Kalender“. Der Server erzeugt ein
`WORKOUT`-Event mit Beschreibung in intervals.icu-Syntax — von dort synchronisiert es
auf Rolle bzw. Uhr. Zielangaben sind Prozentwerte von FTP bzw. Schwellenpace, damit
intervals.icu immer mit den dort hinterlegten Werten rechnet; die App zeigt zusätzlich
die absoluten Watt- und Pace-Bereiche an.

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
  library.ts   Workout-Bibliothek (Rad auf Rolle, Lauf)
  engine.ts    Regel-Engine für die nächsten Tage
  feasibility.ts  Realismus-Check der Ziele
server/        intervals.icu-Client, HTTP-Routen, Node-Entry für die Entwicklung
worker/        Cloudflare-Worker-Entry
  oauth.ts     intervals.icu OAuth: Authorize-URL, Code-Tausch, Refresh
  session.ts   signierte Session-Cookies, OAuth-state
  crypto.ts    HMAC-Signatur und AES-GCM-Verschlüsselung (Web Crypto)
  users.ts     Nutzer- und Konfigurationsspeicher in KV, je Athlet
src/ui/        React-Oberfläche
tests/         Vitest (npm test)
scripts/demo.ts  Plan aus synthetischen Daten, läuft ohne API-Zugang
```

## Konfiguration

`config/athlete.json` wird beim ersten Start angelegt und ist über die Einstellungen in
der App editierbar (FTP, Schwellenpace, Gewicht, Einheiten pro Woche, Zeitbudget, Ziele
mit optionalem Zieldatum). „FTP & Pace von intervals.icu holen“ übernimmt die Werte aus
den dortigen Sport-Settings.
