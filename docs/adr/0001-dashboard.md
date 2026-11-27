# 0001 Dashboard: Regeln auf dem ruhigen Block, Auswertung im Browser

## Kontext

- Das Dashboard unter `/dashboard` zeigt Wochenlast, Kennzahlen je Radfahrt und zwei Puls-Regeln.
- Die Regeln stammen aus dem Showcase `training-dashboard` und wurden nach TypeScript übertragen
  (`src/coach/steady-block.ts`), nicht geteilt.
- Beide Regeln brauchen den Verlauf von Leistung und Puls je Fahrt. Das sind Stream-Abrufe bei
  intervals.icu, einer je Fahrt.
- Ein Worker darf pro Anfrage nur begrenzt viele Abrufe machen. Die App begrenzt `/api/*` auf
  60 Anfragen pro Minute.
- Die meisten echten Fahrten sind Intervalle. Dort schwankt Puls pro Watt mit der Belastung,
  nicht mit dem Körper.

## Entscheidung

- Regeln nur auf dem ruhigen Block einer Fahrt:
  - 10 min Aufwärmen werden ausgelassen.
  - Block: längste Strecke von mindestens 30 min, in der die Minutenleistung höchstens 20 % um
    ihren Mittelwert schwankt.
  - `hrDrift`: Puls pro Watt der zweiten Blockhälfte gegen die erste. Bänder 5 % und 10 %.
  - `elevatedHr`: erste Blockhälfte gegen das Mittel eigener Blöcke der 42 Tage davor, gleiche
    Umgebung, Leistung ±5 %, mindestens 3 Vergleichsfahrten, Schwelle 6 %.
  - Drinnen heißt `VirtualRide` oder `trainer`. Drinnen und draußen werden nie verglichen.
  - Fahrten ohne Block bekommen keine Aussage. Die Abdeckung zeigt, wie viele das sind.
- Kandidat ist jede Radfahrt ab 40 min. Ein Filter über VI entfällt, denn der Block selbst
  entscheidet, ob die Fahrt ruhig genug ist.
- Datenweg in drei Stufen:
  - `/api/dashboard?wochen=` liefert Wochen und Fahrten nur aus der Aktivitätenliste, ohne Streams.
  - Der Browser holt `/api/dashboard/blocks?ids=` in Paketen zu 4 Fahrten, eines nach dem anderen.
    Der Server gibt je Fahrt nur den gefundenen Block zurück, keine Rohwerte.
  - `analyzeSteady` läuft im Browser nach jedem Paket. So wachsen Befunde sichtbar mit.
  - `/api/dashboard/ride/:id` liefert für die gewählte Fahrt den Verlauf in Minutenmitteln.
- Zeitraum 8, 12 oder 26 Wochen. Dazu kommen 42 Tage davor nur als Basis.
- Zwei Darstellungen: ab 1100 px Breite ein dunkles Cockpit mit Animationen, darunter eine
  einfache Ansicht im Stil der App. „Ruhig“ und `prefers-reduced-motion` schalten alle Effekte ab.

## Konsequenzen

- Kein Paket braucht mehr als 4 Stream-Abrufe. Ein Fehler trifft nur ein Paket; „Weiterlesen“
  setzt dort fort.
- 26 Wochen mit Basis sind bis zu 224 Tage Aktivitätenliste. Das liegt über den 180 Tagen, die
  die Datenschutzerklärung für Aktivitäten allgemein nennt; der Dashboard-Zweck steht dort eigens.
- Die Werte für Aufwärmen, Spanne und Blocklänge sind eigene Schätzungen. Die 5-%-Linie ist eine
  Konvention aus der Trainingspraxis, kein geprüfter Grenzwert. Die App sagt das neben jedem Befund.
- Fahrten mit Garmin-Quelle tragen die Garmin-Zuschreibung direkt unter dem Kopf und je Fahrt.
- CPU-Zeit und Abrufe je Anfrage sind lokal geprüft, aber nicht unter echter Last. Nach dem
  Ausrollen mit `npx wrangler tail` messen.
