# Soll-Ist-Diagramm und Strava – Einschätzungen

Stand 25.09.2026. Zusammengefasst aus der Sitzung, in der der Verlauf und die Strava-Anbindung entstanden sind (PR #12).

## 1. Darstellung der absolvierten Einheit

### Ausgangslage: Blöcke

Die Höhe eines Blocks zeigte den Plan, gefüllt hieß im Ziel, hohl hieß daneben. Das Ist steckte nur in der Füllung und im Pfeil darüber.

Was dabei fehlte:

- **Wie weit daneben:** 104 % und 101 % sahen gleich aus. Auf der Skala 0–130 % liegen sie zwei Pixel auseinander.
- **Wo im Intervall:** Ob ein Intervall langsam eingebrochen ist oder schlagartig, war nicht zu sehen.

### Vorschlag A – Verlauf

Die gefahrene Leistung (beim Laufen das Tempo) als Kurve über den Zielkorridoren. Der Puls steht als eigener Streifen darunter.

**Dafür**

- Zeigt, was im Intervall passiert ist: zu hart angefahren, Stopp an der Ampel, Einbruch gegen Ende.
- Die Zeit stimmt, zugeordnet wird aber nach Reihenfolge wie bisher. Der Korridor steht dort, wo das Intervall wirklich lag, und läuft so lang wie geplant. Ein abgebrochenes Intervall ist ein leeres Stück Korridor.
- Der gefüllte Teil des Korridors ist die Zeit im Ziel. Das ist dieselbe Idee wie bei den Blöcken (gefüllt heißt getroffen), nur sekundengenau.
- Der Puls hat einen eigenen Streifen mit eigener Skala. Die Drift von Block zu Block ist ohne Rechnen sichtbar.
- Sportler kennen dieses Bild aus Garmin Connect, TrainingPeaks und intervals.icu. Es taugt direkt als Share-Bild.

**Dagegen**

- **Mehr Daten:** Pro Aktivität braucht es einen Request mehr (`/activity/{id}/streams`). Der Worker dampft ihn auf rund 800 Punkte ein und cacht ihn.
- **Laufen:** Der Tempo-Verlauf ist GPS-verrauscht und braucht 30 Sekunden Glättung.
- **Schwimmen:** Im Becken gibt es keinen brauchbaren Verlauf, dort bleiben die Blöcke.
- **Kann dem Urteil widersprechen:** Die Kurve kann unruhig aussehen, obwohl der Mittelwert trifft. Deshalb steht das Urteil (✓ ↑ ↓) weiter über jedem Korridor.
- **Mehr Platz:** Die Karte wird rund 250 px statt 70 px hoch.

### Vorschlag B – Zielfenster

Nur die Intervalle, mit Lupe auf die Intensität. Jedes Intervall ist ein Kasten (Soll) mit einem Balken darin (Ist). Die Höhe zeigt die Intensität, die Länge die Dauer.

**Dafür**

- Liest sich in beiden Richtungen: zu hart oder zu leicht nach oben und unten, zu kurz nach links. Ein abgebrochenes Intervall ist ein halb leerer Kasten.
- Die Skala ist auf den Bereich um das Ziel gezoomt, 101 % und 104 % liegen sichtbar auseinander.
- Bild und Urteil beruhen auf derselben Zahl, dem Mittel je Intervall. Nichts im Bild widerspricht dem Häkchen.
- Braucht keine neuen Daten, alles steht schon in `icu_intervals`. Funktioniert für Rad, Laufen und Schwimmen gleich.

**Dagegen**

- Kein Verlauf im Intervall: Ob zu hart angefahren oder langsam eingebrochen, bleibt unsichtbar.
- Zeichnet im Kern die Zahlen, die hinter „Intervall für Intervall“ schon stehen. Mehr Überblick, wenig neue Information.
- Ein- und Ausfahren und Pausen fallen weg.
- Als Share-Bild zu abstrakt: Ohne Legende versteht es außerhalb der App niemand.

### Vergleich

| | Blöcke (vorher) | A · Verlauf | B · Zielfenster |
|---|---|---|---|
| Wie weit daneben | nein, nur ✓ ↑ ↓ | ja | ja, am genauesten |
| Wo im Intervall | nein | ja, sekundengenau | nein |
| Puls | nein | Verlauf | Mittel je Intervall |
| Neue Daten | – | Streams, 1 Request je Aktivität | keine |
| Laufen, Schwimmen | ja | Laufen geglättet, Becken nein | ja |
| Share-Bild | schwach | stark | mittel |
| Aufwand | – | mittel | klein |

### Entscheidung

**A.** Nur A zeigt wirklich neue Information: den Verlauf im Intervall und den Puls über die Zeit. B zeichnet schöner, was in den Zeilen darunter schon steht. Und A ist gleichzeitig das Share-Bild.

Umgesetzt:

- A ersetzt die Blöcke. „Intervall für Intervall“ bleibt als Detail darunter.
- Ohne Verlauf (Becken, keine Leistungsmessung, Intervalle ohne Position) zeigt die Karte weiter die Blöcke.
- Die Skala beginnt bei 30 % statt 0. Ein Korridor von 97–102 % war sonst zu dünn.

## 2. Strava

### Kurzantwort

| | |
|---|---|
| Upload über die eigene App | geht: `POST /uploads` mit Titel und Beschreibung, Scope `activity:write` |
| Bild an die Aktivität hängen | geht nicht: Die öffentliche API hat keinen Foto-Upload, den gibt es nur für Partner wie Zwift, Peloton und TrainerRoad |

### Weg 1 – die App lädt hoch

Gerät → intervals.icu → Webhook „Aktivität analysiert“ → Worker holt die Originaldatei (`/activity/{id}/file`) → `POST /uploads` zu Strava.

- **Voraussetzung:** Gerät → Strava und Zwift → Strava müssen aus sein, sonst lehnt Strava die zweite Datei als Duplikat ab.
- **Risiko:** Fallen Webhook oder Worker aus, fehlt die Einheit auf Strava ganz.
- **Vorteil:** Volle Kontrolle über den Titel.

### Weg 2 – das Gerät lädt hoch, die App ergänzt (gewählt)

Gerät → Strava und intervals.icu wie bisher → Worker findet die Strava-Aktivität über die Startzeit (`GET /athlete/activities`) → hängt die Auswertung an die Beschreibung an (`PUT /activities/{id}`).

- Nichts umstellen, keine Duplikate.
- Fällt die App aus, fehlt nur der Text.
- Die App hängt an, statt zu überschreiben, und ersetzt nur ihren eigenen Absatz. Der eigene Text bleibt stehen.

### Das Bild als Werbung

| Weg | Wie | Aufwand für dich |
|---|---|---|
| Beschreibung | Verlaufszeile aus Blockzeichen, Ergebnis je Intervall, Link zur App | automatisch |
| Teilen-Menü | App zeichnet ein 1080-px-PNG, Teilen in die Strava-App, eine Instagram-Story oder WhatsApp | ein Tipp |
| Partner-API | Foto direkt an die Aktivität | Kommerzieller Partnerzugang (Extended Access) – unrealistisch |

Der Puls steht bewusst nicht in der Strava-Beschreibung. Strava lässt dich die Herzfrequenz pro Aktivität verbergen, die Beschreibung würde sie trotzdem zeigen.

### Rahmen (Stand September 2026)

- **Abo:** API-Zugang als Standard-Entwickler nur noch mit Strava-Abo. Für neue Entwickler gilt das seit 01.06.2026, für bestehende seit 30.06.2026.
- **Athleten-Limit:** Neue Apps starten mit 1 Athleten. Bis 10 per Self-Upgrade, darüber nur nach Review. Das Review verlangt den offiziellen „Connect with Strava“-Button.
- **Scopes:** `activity:write`, für Weg 2 zusätzlich `activity:read_all`, damit auch private Aktivitäten gefunden werden.
- **API-Umstellung:** Ab 01.06.2027 gelten eine neue API-URL und Anmeldung per Header.

## 3. Reviews

### Review-Agent

| Befund | Einstufung | Ergebnis |
|---|---|---|
| Ein Fehler mitten im Cron-Lauf verwirft die schon geschriebenen Einträge | Warnung | behoben: Fehler je Einheit, bei Rate-Limit stoppt der Lauf, der Rest bleibt gespeichert |
| Beide Anmelde-Flows teilen sich ein State-Cookie, Anmeldung in zwei Tabs bricht ab | Warnung | behoben: eigenes Cookie für Strava |
| Mindestfrist von Cloudflare verschiebt die Löschfrist um bis zu 61 s | Hinweis | belassen, im Code kommentiert |
| Strava-Status wird im Modul zwischengespeichert, ohne Leeren beim Abmelden | Hinweis | belassen: jedes An- und Abmelden lädt die Seite neu |

Ohne Befund: Token-Refresh, Verankerung der Löschfrist, Wiederholbarkeit der Beschreibung, Aufteilung des Verlaufs in Zeitscheiben auch bei 5-Stunden-Fahrten.

### `/code-review` (medium)

| Befund | Ergebnis |
|---|---|
| Cron schreibt eine während des Laufs getrennte oder gelöschte Verbindung zurück (Löschpflicht nach Art. 17) | behoben, mit Test |
| Auf dem iPhone öffnet „Bild teilen“ das Teilen-Menü nicht, wenn das Bild erst nach dem Tipp gezeichnet wird | behoben: Bild wird beim Laden der Karte gezeichnet. Kein Unit-Test möglich, die Regel liegt in Safari. |
| Vorbelastungs-Einheiten vor Rennen bekommen keine Strava-Zusammenfassung, Button meldet „nicht gefunden“ | trifft nicht zu: Die Vergleichs-Route lehnt diese Einheiten schon ab, Karte und Buttons erscheinen nicht |
| Cron bearbeitet alle Athleten in einem Lauf und stößt im kostenlosen Cloudflare-Tarif an 50 Subrequests | bekannte Grenze: reicht für eine Handvoll aktive Athleten, nicht für zehn |

### Eigene Prüfung

| Befund | Ergebnis |
|---|---|
| Prettier-Hook formatiert ganze Dateien um | zurückgesetzt, Änderungen ab da per Skript |
| Server liefert HTML statt JSON auf `/api/strava`, die Karte stürzt ab | behoben, mit Test |
| Puls in der Strava-Beschreibung umgeht „Herzfrequenz verbergen“ | entfernt, mit Test |
| Cron verlängert die 12-Monats-Löschfrist | behoben: Cron-Schreibzugriffe behalten die bestehende Frist |
| Trennen mit abgelaufenem Token entzieht den Zugriff auf Strava nicht | behoben: erst Token erneuern, dann entziehen, mit Test |

Geprüfte Grenzfälle:

- fehlender oder leerer Verlauf
- pausierte Aufzeichnung (Lücken bleiben Lücken)
- 5-Stunden-Fahrten
- Intervalle ohne Position oder nicht absolviert
- Schwimmen und Laufen
- abgelaufene Tokens bei Strava und intervals.icu
- Strava antwortet mit 429 oder 500
- Einheit noch nicht auf Strava
- zwei Anmelde-Flows parallel

## 4. Offen

- [ ] Mit echten Daten prüfen, ob `start_time`/`end_time` aus `icu_intervals` auf der Zeitachse der Streams liegen. Wenn nicht, stehen die Korridore an der falschen Stelle.
- [ ] „Bild teilen“ auf dem iPhone testen.
- [ ] Strava einrichten: Abo, App unter strava.com/settings/api mit der Worker-Domain als Callback Domain, `STRAVA_CLIENT_ID` und `STRAVA_CLIENT_SECRET` per `wrangler secret put`.
- [ ] Deploy-Fehler 10063 beheben: Einmal im Cloudflare-Dashboard „Workers & Pages“ öffnen, das legt die workers.dev-Subdomain an. Danach den Deploy-Lauf wiederholen. Alternativ den Cron bis zur Strava-Einrichtung entfernen.
- [ ] Vor einem Strava-Review den offiziellen „Connect with Strava“-Button einbauen.

## Quellen

- [Strava · Uploading to Strava](https://developers.strava.com/docs/uploads/)
- [Strava Community · How to upload a photo to an activity](https://communityhub.strava.com/developers-api-7/how-to-upload-a-photo-to-an-activity-13044)
- [Strava · An update to our developer program](https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428)
- [Strava · Our developer program](https://communityhub.strava.com/developers-knowledge-base-14/our-developer-program-3203)
- [intervals.icu Forum · Activity streams via API](https://forum.intervals.icu/t/access-activities-streams-via-api/101065)
- [intervals.icu Forum · Webhooks](https://forum.intervals.icu/t/webhooks-develpment/125147)
- [intervals.icu Forum · Original FIT file download](https://forum.intervals.icu/t/can-i-download-the-original-fit-file-directly-from-intervals-icu/110550)
