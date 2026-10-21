# Demo-Zugang

Formkurve mit Beispieldaten, zum Zeigen in Bewerbungen und Gesprächen. Eine erfundene
Athletin (Rad, Lauf, Schwimmen) mit einem Jahr Training: ruhige Grundlage, danach zwölf
strukturierte Wochen im 3:1-Rhythmus mit Schwellentests, Formkontrolle, einer Erkältung
als eingetragener Pause und einer ausgefallenen Qualitätseinheit kurz vor heute. Am
Plan sieht man so, wie die App nach einem Ausfall umplant. Alles liegt relativ zu
„heute“, die Demo wirkt also an jedem Tag aktuell, und derselbe Tag ergibt immer
dieselben Daten.

Keine echten Trainingsdaten, auch nicht vom Betreiber. Die Demo ruft intervals.icu nie auf
und braucht keinen API-Key.

## Wie sie gebaut ist

- **Eigener Worker** (`formkurve-demo`, Umgebung `demo` in `wrangler.jsonc`) mit eigenem
  KV-Namespace. Mit dem echten Worker teilt er nichts.
- **Dieselben Routen, andere Datenquelle.** Plan, Verlauf und Soll/Ist laufen durch
  `server/routes.ts` wie bei echten Nutzern. Statt `httpSource` (intervals.icu) steckt
  `fixtureSource` (`server/demo/`) hinter der Schnittstelle `IntervalsSource`.
- **Strikte Trennung.** `worker/demo.ts` importiert weder Nutzerspeicher noch OAuth noch
  Strava. Ist neben `DEMO_MODE` ein intervals.icu- oder Strava-Zugang (oder `APP_PASSWORD`)
  gesetzt, verweigert der Worker den Start und nennt den Namen der Variable.
- **Sandbox je Besucher.** Jede Anmeldung bekommt eine eigene Kopie der Einstellungen.
  Pausen, „Heute hart/locker/Pause“ und Einstellungen funktionieren, verfallen aber zwei
  Stunden nach der letzten Änderung (KV-TTL). Danach gilt wieder der Ausgangszustand.
  Was ein Besucher ändert, sieht kein anderer.
- **Kein Schreiben nach außen.** „In den Kalender“, Schwelle übernehmen nach intervals.icu
  und Puls korrigieren antworten mit „Demo mit Beispieldaten: hier wird nichts an
  intervals.icu gesendet.“ Strava, Warteliste und Konto löschen gibt es in der Demo nicht.
- **Hinweis in der UI.** „Demo mit Beispieldaten“ steht in der Kopfzeile jeder Ansicht.

## Einmalig einrichten

```bash
npx wrangler kv namespace create COACH_CONFIG --env demo
# die ausgegebene id in wrangler.jsonc unter env.demo.kv_namespaces eintragen
# (ersetzt REPLACE_WITH_DEMO_KV_NAMESPACE_ID)

npx wrangler secret put DEMO_PASSWORD --env demo    # frei wählbar
npm run deploy:demo
```

Danach liegt die Demo unter `https://formkurve-demo.<dein-subdomain>.workers.dev`. Für eine
eigene Adresse (z. B. `demo.formkurve.org`) im Cloudflare-Dashboard beim Worker
`formkurve-demo` unter *Settings → Domains & Routes* eine Custom Domain hinzufügen.

Der GitHub-Workflow deployt nur die Produktion. Die Demo wird von Hand mit
`npm run deploy:demo` aktualisiert, auch nach Änderungen an der App.

**Nicht setzen** in der Umgebung `demo`: `INTERVALS_*`, `APP_PASSWORD`, `STRAVA_*`. Optional
ist `SESSION_SECRET`. Dann signiert er die Sitzungen statt des Demo-Passworts, und ein
Passwortwechsel beendet sie nicht mehr.

## Zugang weitergeben

Adresse und Demo-Passwort, zum Beispiel im Anschreiben:

> Formkurve lässt sich mit Beispieldaten ausprobieren: demo.formkurve.org, Passwort `…`

Jeder, der sich anmeldet, landet in seiner eigenen Sandbox. Ein Passwort für alle reicht
also. Pro Bewerbungsrunde ein eigenes Passwort zu nehmen, schadet aber nicht.

## Zurücksetzen

- **Automatisch:** Änderungen eines Besuchers verfallen zwei Stunden nach seiner letzten
  Änderung.
- **Alle Sitzungen beenden:** Demo-Passwort ändern
  (`npx wrangler secret put DEMO_PASSWORD --env demo`). Alte Cookies werden damit ungültig
  (außer `SESSION_SECRET` ist gesetzt).
- **Alle Sandboxen sofort löschen:**

  ```bash
  npx wrangler kv key list --binding COACH_CONFIG --env demo --remote --prefix demo-sandbox: \
    | jq -r '.[].name' \
    | xargs -I{} npx wrangler kv key delete --binding COACH_CONFIG --env demo --remote {}
  ```

- **Demo abschalten:** `npx wrangler delete --env demo`. Die Produktion bleibt davon
  unberührt.

## Lokal

```bash
cp .dev.vars.demo.example .dev.vars.demo   # nur DEMO_PASSWORD, keine echten Secrets
npm run cf:demo                            # wrangler dev --env demo
npm run demo:preview                       # Plan und Verlauf der Demo als Text
npm run demo:preview -- 2026-12-24         # … an einem beliebigen Tag
```

## Dateien

| Datei | Inhalt |
|---|---|
| `server/source.ts` | Schnittstelle `IntervalsSource`, `httpSource` für intervals.icu |
| `server/demo/fixtures.ts` | Generator der Beispieldaten (Seed, relativ zu heute) |
| `server/demo/source.ts` | `fixtureSource`: dieselbe Schnittstelle, ohne Netz |
| `worker/demo.ts` | Demo-App: Login, Sandbox, Trennung |
| `src/ui/components/DemoBadge.tsx` | Hinweis „Demo mit Beispieldaten“ |
| `tests/demo-*.test.ts`, `tests/worker-demo.test.ts` | Fixtures, Planer, Demo Ende zu Ende |
