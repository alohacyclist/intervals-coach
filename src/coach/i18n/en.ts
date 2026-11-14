/**
 * The English of every sentence the app writes, keyed by the German sentence as it
 * stands in the code. `{0}`, `{1}` are the values of a tagged sentence, in the order
 * the German names them; English may use them in another order. A sentence missing
 * here stays German, and tests/i18n-catalogue.test.ts fails until it is added
 * (`npx tsx scripts/i18n-keys.ts` lists what is missing).
 */
export const EN: Readonly<Record<string, string>> = {
  "Demo mit Beispieldaten: hier wird nichts an intervals.icu gesendet.":
    "Demo with sample data: nothing is sent to intervals.icu here.",
  "intervals.icu 404: Anfrage abgelehnt.": "intervals.icu 404: request rejected.",
  "Missing environment variable {0}. Copy .env.example to .env and fill it in.":
    "Missing environment variable {0}. Copy .env.example to .env and fill it in.",
  "Die Anmeldung bei intervals.icu ist abgelaufen. Bitte neu anmelden.":
    "Your intervals.icu sign-in has expired. Please sign in again.",
  "intervals.icu drosselt gerade die Anfragen. Bitte in ein paar Minuten noch einmal versuchen.":
    "intervals.icu is throttling requests right now. Please try again in a few minutes.",
  "intervals.icu ist gerade nicht erreichbar. Bitte später noch einmal versuchen.":
    "intervals.icu cannot be reached right now. Please try again later.",
  "intervals.icu {0} — API-Key oder Athlete-ID prüfen (intervals.icu → Settings → Developer).":
    "intervals.icu {0} — check the API key or athlete ID (intervals.icu → Settings → Developer).",
  "intervals.icu {0}: Zugriff verweigert. Abmelden und neu anmelden erteilt die nötigen Rechte.":
    "intervals.icu {0}: access denied. Signing out and in again grants the permissions needed.",
  "intervals.icu {0}: Anfrage abgelehnt.": "intervals.icu {0}: request rejected.",
  "Ungültige Anfrage": "Invalid request",
  "Unerwarteter Fehler. Bitte später noch einmal versuchen.":
    "Unexpected error. Please try again later.",
  "Ungültige Aktivität": "Invalid activity",
  "Zu dieser Einheit gibt es keinen Plan zum Vergleichen":
    "There is no plan to compare this session with",
  "Zurückschreiben geht nur mit einem API-Key von intervals.icu.":
    "Writing back only works with an intervals.icu API key.",
  "An dieser Aufzeichnung gibt es nichts mehr zu korrigieren.":
    "There is nothing left to correct in this recording.",
  "Die Aufzeichnung hat sich geändert. Bitte neu laden und noch einmal prüfen.":
    "The recording has changed. Please reload and check again.",
  "intervals.icu hat das Überschreiben abgelehnt. Streams ändern dürfen dort nur Supporter.":
    "intervals.icu refused the overwrite. Only supporters may change streams there.",
  "sport muss Ride, Run oder Swim sein": "sport must be Ride, Run or Swim",
  "enabled und taper müssen true oder false sein": "enabled and taper must be true or false",
  "races muss eine Liste sein": "races must be a list",
  "Höchstens {0} Rennen": "At most {0} races",
  "Eintrag {0}": "Entry {0}",
  "{0}: Route unbekannt": "{0}: unknown route",
  "{0}: Datum, Format oder Runden ungültig": "{0}: invalid date, format or laps",
  "Ein Datum ist doppelt eingetragen": "A date is entered twice",
  "Unbekannte Trainingsfamilie": "Unknown training family",
  "Diese Stufe gibt es in der Familie nicht": "This family has no such level",
  "kind muss eines von {0} sein": "kind must be one of {0}",
  "days muss zwischen 1 und {0} liegen": "days must be between 1 and {0}",
  "Keine Pause eingetragen": "No break entered",
  "Unbekanntes Workout: {0}": "Unknown workout: {0}",
  "variant muss eines von {0} sein": "variant must be one of {0}",
  "manuell ausgewählt": "chosen by hand",
  "Keine {0}-Fassung für {1}": "No {0} version for {1}",
  "Einheit ohne Namen": "Unnamed session",
  "Formkontrolle: dieselbe Einheit alle acht Wochen. Verglichen wird Tempo bzw. Leistung pro Herzschlag in den Intervallen — heute wird die erste Referenz gesetzt.":
    "Form check: the same session every eight weeks. What is compared is pace or power per heartbeat in the intervals — today sets the first reference.",
  "Formkontrolle: dieselbe Einheit wie vor {0} Wochen. Mehr Arbeit pro Herzschlag ist der Fortschritt.":
    "Form check: the same session as {0} weeks ago. More work per heartbeat is the progress.",
  "Erste Referenz gesetzt. Beim nächsten Mal gibt es einen Vergleich.":
    "First reference set. Next time there will be a comparison.",
  "Erste Referenz: {0} bpm im Schnitt. Beim nächsten Mal gibt es einen Vergleich.":
    "First reference: {0} bpm on average. Next time there will be a comparison.",
  "Ohne Herzfrequenz lässt sich die Einheit nicht vergleichen.":
    "Without heart rate the session cannot be compared.",
  "gegenüber {0}": "compared with {0}",
  "{0} bpm — unverändert{1}. Gleiche Arbeit, gleicher Preis.":
    "{0} bpm — unchanged{1}. Same work, same price.",
  "{0} bpm statt {1}{2}: {3} Schläge weniger für dieselbe Arbeit. Das ist der Fortschritt.":
    "{0} bpm instead of {1}{2}: {3} beats fewer for the same work. That is the progress.",
  "{0} bpm statt {1}{2}: {3} Schläge mehr. Ermüdung, Hitze oder ein Formverlust — erst beim nächsten Mal wiederholen, bevor du daraus etwas ableitest.":
    "{0} bpm instead of {1}{2}: {3} beats more. Fatigue, heat or a loss of form — repeat it next time before you read anything into it.",
  "Leistung": "Power",
  "{0} % bei {1} bpm": "{0} % at {1} bpm",
  "{0}: gleiche Effizienz.": "{0}: same efficiency.",
  "{0}: {1} % effizienter. Das ist der Fortschritt.":
    "{0}: {1} % more efficient. That is the progress.",
  "{0}: {1} % weniger effizient. Ermüdung, Hitze oder ein Formverlust — erst beim nächsten Mal wiederholen, bevor du daraus etwas ableitest.":
    "{0}: {1} % less efficient. Fatigue, heat or a loss of form — repeat it next time before you read anything into it.",
  "Krankheit": "Illness",
  "Impfung": "Vaccination",
  "Verletzung": "Injury",
  "Die Reaktion kommt meist erst 12 bis 36 Stunden später, nicht sofort. Erst zwei Tage nichts, danach höchstens locker.":
    "The reaction usually comes 12 to 36 hours later, not at once. Nothing for two days first, then easy at most.",
  "Zurück nach der Impfung — Schwelle vor VO₂max.":
    "Back after the vaccination — threshold before VO₂max.",
  "Bei Fieber oder Beschwerden unterhalb des Halses gehört Training ganz weg. Grund ist das Risiko einer Herzmuskelentzündung, nicht die Leistung.":
    "With a fever or symptoms below the neck, training is off entirely. The reason is the risk of myocarditis, not performance.",
  "Erste Woche zurück nach Krankheit — Umfang vor Intensität, VO₂max wartet.":
    "First week back after illness — volume before intensity, VO₂max waits.",
  "Was schmerzfrei geht, darf locker weiterlaufen. Alles andere pausiert.":
    "What works without pain may carry on easy. Everything else pauses.",
  "Zurück nach der Verletzung — erst wieder Belastung aufbauen, dann Spitzen.":
    "Back after the injury — build load again first, then the peaks.",
  "Keine körperliche Einschränkung — der Plan hält still und drängt nicht auf das Wochenpensum.":
    "No physical restriction — the plan holds still and does not push for the weekly quota.",
  "Ungültige Konfiguration: {0}": "Invalid configuration: {0}",
  "{0}.metric muss power, pace oder swimPace sein": "{0}.metric must be power, pace or swimPace",
  "profile.sports braucht mindestens eine Sportart": "profile.sports needs at least one sport",
  "{0}.sport muss Ride, Run oder Swim sein": "{0}.sport must be Ride, Run or Swim",
  "profile.sports darf jede Sportart nur einmal enthalten":
    "profile.sports may contain each sport only once",
  "profile.weeklySessions.min darf nicht über max liegen":
    "profile.weeklySessions.min must not be above max",
  "{0}.kind muss ftp oder raceTime sein": "{0}.kind must be ftp or raceTime",
  "{0}: ein FTP-Ziel gibt es nur fürs Rad": "{0}: an FTP goal exists for the bike only",
  "Ziel": "Goal",
  "Onboarding noch nicht abgeschlossen": "Onboarding not finished yet",
  "Fitness in vier Wochen {0} — es fehlen Einheiten ({1} statt {2} pro Woche), nicht Härte":
    "Fitness over four weeks {0} — what is missing is sessions ({1} instead of {2} per week), not hardness",
  "Fitness in vier Wochen nur {0} bei vollem Pensum — die Einheiten werden mit lockerer Grundlage länger, nicht härter. Eine Einheit mehr pro Woche hilft ebenso.":
    "Fitness over four weeks only {0} at full volume — the sessions get longer with easy endurance, not harder. One more session a week helps just as much.",
  "Harter Lauf vor {0} Tagen — Sehnen und Knochen brauchen 72h, Kreislauf ist bereit":
    "Hard run {0} days ago — tendons and bones need 72h, the heart is ready",
  "{0} Freiwillig, nicht eingeplant.": "{0} Optional, not scheduled.",
  "Wochenpensum erfüllt ({0} von {1}) — heute ist Pause eingeplant":
    "Weekly quota met ({0} of {1}) — today is a scheduled rest day",
  "{0} Ruhetage in Folge, Wochenpensum bereits erfüllt — freiwillig, nicht eingeplant. {1}":
    "{0} rest days in a row, weekly quota already met — optional, not scheduled. {1}",
  "{0} Solange die Pause eingetragen ist, gibt es keine harte Einheit — beende sie oben, wenn du wieder fit bist.":
    "{0} As long as the break is entered there is no hard session — end it above when you are fit again.",
  "Achtung: erst {0} eine harte Einheit — zwei harte Tage hintereinander kosten mehr, als sie bringen.":
    "Careful: a hard session only {0} — two hard days in a row cost more than they give.",
  "heute": "today",
  "Achtung: {0}.": "Careful: {0}.",
  "Von dir gewählt: {0}. Der Plan hätte vorgesehen: {1}{2}":
    "Your choice: {0}. The plan would have set: {1}{2}",
  "harte Einheit": "a hard session",
  "lockere Einheit": "an easy session",
  "Pause": "Rest",
  "Erholungssignale und tiefe Form — heute gar nichts":
    "Recovery signals and deep fatigue — nothing at all today",
  "Erholungssignale sprechen gegen Belastung": "Recovery signals speak against load",
  "Form deutlich im Minus — nur Regeneration": "Form clearly negative — recovery only",
  "Die letzte harte Einheit war kurz (Load {0}) — locker statt Pause":
    "The last hard session was short (load {0}) — easy instead of rest",
  "Mindestpensum erfüllt und keine 48h seit der letzten harten Einheit":
    "Minimum quota met and less than 48h since the last hard session",
  "Keine 48h seit der letzten harten Einheit, aber die Woche läuft aus — locker statt Pause":
    "Less than 48h since the last hard session, but the week is running out — easy instead of rest",
  "{0} — heute locker": "{0} — easy today",
  "Wochenbudget harter Einheiten erreicht ({0}/{1})":
    "Weekly budget of hard sessions reached ({0}/{1})",
  "{0}, aber nach {1} Ruhetagen und mit Form {2} ist eine weitere Qualitätseinheit vertretbar.":
    "{0}, but after {1} rest days and with form {2} another quality session is justifiable.",
  "Hohe Ermüdung — locker halten": "High fatigue — keep it easy",
  "Erholungswerte unter deiner Baseline": "Recovery values below your baseline",
  "Erholt und im Wochenbudget — heute darf es wehtun":
    "Recovered and within the weekly budget — today it may hurt",
  "· Stufe {0} von {1} verfügbar — Stufe {2} passt heute nicht in Zeit oder Phase":
    "· Level {0} of {1} available — level {2} does not fit today's time or phase",
  "· Stufe {0}, selbst gewählt": "· Level {0}, chosen by you",
  "· Stufe {0} — Stufe {1} kommt, sobald jedes Intervall voll und mindestens im Zielbereich gefahren ist":
    "· Level {0} — level {1} comes once every interval is ridden in full and at least in the target range",
  "· Stufe {0}": "· Level {0}",
  "dieser Reiz fehlt seit über vier Wochen": "this stimulus has been missing for over four weeks",
  "{0} zuletzt vor {1} Tagen": "{0} last done {1} days ago",
  "{0}, Qualitätstag — {1}{2}": "{0}, quality day — {1}{2}",
  "Lockerer Tag zwischen zwei harten Einheiten ({0})": "Easy day between two hard sessions ({0})",
  "Regeneration hat Vorrang ({0})": "Recovery comes first ({0})",
  "{0} Tage ohne Training — Wiedereinstieg über die Schwelle, VO₂max erst danach":
    "{0} days without training — back in via threshold, VO₂max only after that",
  "Diese Woche {0} von mindestens {1} Einheiten": "This week {0} of at least {1} sessions",
  "Vorgenommen {0} Einheiten/Woche, zuletzt {1} — geplant wird mit {2}":
    "Intended {0} sessions/week, lately {1} — the plan works with {2}",
  "Fitness steigt schnell (+{0}/Woche) — Verletzungsrisiko beachten":
    "Fitness is rising fast (+{0}/week) — mind the injury risk",
  "Die Fitness steigt gerade schnell — deshalb nicht über deine längste Einheit hinaus.":
    "Fitness is rising fast right now — so no further than your longest session.",
  "in den letzten sechs Wochen kein Lauf, an dem sich mehr messen ließe.":
    "no run in the last six weeks to measure more against.",
  "dein längster Lauf der letzten sechs Wochen waren {0} min, und Laufen wächst in kleinen Schritten.{1}":
    "your longest run of the last six weeks was {0} min, and running grows in small steps.{1}",
  "mehr tragen deine Fitness (CTL {0}) und deine längsten Fahrten ({1} min in zwölf Wochen) heute noch nicht.{2}":
    "your fitness (CTL {0}) and your longest rides ({1} min in twelve weeks) do not carry more yet today.{2}",
  "Mehr Zeit: heute nicht ({0})": "More time: not today ({0})",
  "Mehr Zeit ändert heute nichts: {0}": "More time changes nothing today: {0}",
  "Rennen": "Race",
  "das Rennen bestimmt den Tag.": "the race decides the day.",
  "heute ist Pause.": "today is a rest day.",
  "Erholung": "Recovery",
  "Erholung hat Vorrang — die zusätzliche Zeit wäre Belastung, keine Grundlage.":
    "Recovery comes first — the extra time would be load, not endurance.",
  "{0}: lange nicht gemacht": "{0}: not done for a long time",
  "{0} {1} min wie eingestellt — Vorsicht: {2}": "{0} {1} min as set — careful: {2}",
  "{0}: mehr als empfohlen ({1} min)": "{0}: more than recommended ({1} min)",
  "{0} {1} min wie eingestellt — empfohlen wären bis {2} min: {3}":
    "{0} {1} min as set — up to {2} min would be recommended: {3}",
  "Mehr Zeit: lockere Grundlage nach den Intervallen":
    "More time: easy endurance after the intervals",
  "Mehr Zeit an einem Qualitätstag: die Intervalle bleiben, wie sie sind — die zusätzliche Zeit ist lockere Grundlage danach.":
    "More time on a quality day: the intervals stay as they are — the extra time is easy endurance afterwards.",
  "Mehr Zeit: Intervalle ab Minute {0}": "More time: intervals from minute {0}",
  "Mehr Zeit an einem Qualitätstag: die Intervalle bleiben, wie sie sind — lockere Grundlage davor, bis sie ab Minute {0} beginnen, der Rest danach.":
    "More time on a quality day: the intervals stay as they are — easy endurance before, until they begin at minute {0}, the rest after.",
  "Mehr Zeit: längere Grundlage": "More time: longer endurance",
  "Mehr Zeit an einem lockeren Tag: mehr Grundlage, nicht mehr Tempo.":
    "More time on an easy day: more endurance, not more pace.",
  "Mehr Zeit: Test bleibt, wie er ist": "More time: the test stays as it is",
  "Mehr Zeit ändert heute nichts: ein Test bleibt, wie er ist — verlängert misst er etwas anderes.":
    "More time changes nothing today: a test stays as it is — lengthened, it measures something else.",
  "{0} — die Qualität heute in der anderen Sportart, der Lauf bleibt leicht":
    "{0} — the quality goes to the other sport today, the run stays light",
  "intervals.icu hat in dieser Aktivität keine Intervalle erkannt.":
    "intervals.icu found no intervals in this activity.",
  "Keine Leistungsdaten — die Einheit lief ohne Wattmessung.":
    "No power data — the session ran without a power meter.",
  "Keine Tempodaten für die Intervalle.": "No pace data for the intervals.",
  "Kurze Intervalle fasst intervals.icu zu Blöcken zusammen — einzeln lassen sie sich nicht vergleichen.":
    "intervals.icu merges short intervals into blocks — they cannot be compared one by one.",
  "Ziel erreicht: jetzt {0} W, angepeilt waren {1} W.":
    "Goal reached: now {0} W, the target was {1} W.",
  "Jetzt {0} W → {1} W, kein Zieldatum. Bei realistischen {2} %/Monat sind das rund {3} Monate.":
    "Now {0} W → {1} W, no target date. At a realistic {2} %/month that is about {3} months.",
  "Machbar mit zwei Qualitätseinheiten pro Woche.": "Doable with two quality sessions a week.",
  "Möglich, wenn du drei Wochen am Stück belastest und die vierte reduzierst — Regeneration ist hier der Engpass.":
    "Possible if you load three weeks in a row and reduce the fourth — recovery is the bottleneck here.",
  "Zeitfenster verlängern oder Ziel senken; schneller geht es nur mit deutlich mehr Umfang.":
    "Extend the time frame or lower the goal; faster only works with clearly more volume.",
  "Jetzt {0} W → {1} W in {2} Wochen = +{3} W/Woche nötig (realistisch ~{4} W/Woche). {5}":
    "Now {0} W → {1} W in {2} weeks = +{3} W/week needed (realistic ~{4} W/week). {5}",
  "aus deiner CSS hochgerechnet": "projected from your CSS",
  "aus deiner Schwellenpace hochgerechnet": "projected from your threshold pace",
  "({0}, ohne Distanz keine Hochrechnung)": "({0}, no projection without a distance)",
  "auf {0} ({1}{2} → {3}{4}, {5})": "over {0} ({1}{2} → {3}{4}, {5})",
  "Jetzt {0} → {1}{2}": "Now {0} → {1}{2}",
  "Der Engpass ist die Laufhäufigkeit: in den letzten drei Monaten vor dem Ziel brauchst du {0}+ Läufe/Woche statt der aktuell geplanten {1} Einheiten insgesamt.":
    "The bottleneck is how often you run: in the last three months before the goal you need {0}+ runs/week instead of the {1} sessions currently planned in total.",
  "{0} — die Zielzeit liegt bereits im Bereich deiner aktuellen Form.{1}":
    "{0} — the target time is already within reach of your current form.{1}",
  "{0}, kein Zieldatum.{1}": "{0}, no target date.{1}",
  "{0} in {1} Wochen = {2} s/Woche nötig (realistisch ~{3} s/Woche).{4}":
    "{0} in {1} weeks = {2} s/week needed (realistic ~{3} s/week).{4}",
  "(Rampe)": "(ramp)",
  "{0} @ Pause am Rand": "{0} @ rest at the wall",
  "{0}\n\n{1}\n\nWarum heute: {2}\n\n(automatisch erstellt von Etmal)":
    "{0}\n\n{1}\n\nWhy today: {2}\n\n(created automatically by Etmal)",
  "{0}.–{1}. min": "min {0}–{1}",
  "{0} und {1} weitere": "{0} and {1} more",
  "zu hoch für die Leistung": "too high for the power",
  "zu hoch für das Tempo — oft zählt die Uhr dann die Schritte statt des Pulses":
    "too high for the pace — often the watch is then counting steps instead of the pulse",
  "zu niedrig für die Leistung — oft sitzt der Sensor zu locker":
    "too low for the power — often the sensor sits too loosely",
  "zu niedrig für das Tempo — oft sitzt die Uhr zu locker":
    "too low for the pace — often the watch sits too loosely",
  "ohne Messung": "without a reading",
  "passen nicht zur Leistung": "do not match the power",
  "passen nicht zum Tempo": "do not match the pace",
  "folgen der Leistung gar nicht": "do not follow the power at all",
  "folgen dem Tempo gar nicht": "do not follow the pace at all",
  "Pulsaufzeichnung unbrauchbar: die Werte {0}.": "Heart-rate recording unusable: the values {0}.",
  "Pulsaufzeichnung gestört: {0} von {1} min {2} ({3}).":
    "Heart-rate recording disturbed: {0} of {1} min {2} ({3}).",
  "Geschätzt aus {0} min sauberer Messung{1}. Geschätzte Werte sind mit ~ markiert.":
    "Estimated from {0} min of clean readings{1}. Estimated values are marked with ~.",
  ": Ø {0} bpm statt der aufgezeichneten {1}": ": avg {0} bpm instead of the recorded {1}",
  "Daraus lässt sich nichts schätzen — der Puls ist für diese Einheit ausgeblendet.":
    "Nothing can be estimated from that — heart rate is hidden for this session.",
  "Zu wenig saubere Messung für eine Schätzung — der Puls ist dort ausgeblendet.":
    "Too few clean readings for an estimate — heart rate is hidden there.",
  "Puls von Etmal korrigiert: {0} min ({1}) passten nicht zur Arbeit":
    "Heart rate corrected by Etmal: {0} min ({1}) did not match the work",
  "und sind aus der sauberen Messung geschätzt.": "and are estimated from the clean readings.",
  "Ø aufgezeichnet {0} bpm, korrigiert {1} bpm.": "Avg recorded {0} bpm, corrected {1} bpm.",
  "Einfahren": "Warm-up",
  "Ausfahren": "Cool-down",
  "Auslaufen": "Cool-down",
  "Ausschwimmen": "Cool-down",
  "Vorbelastung vor dem Rennen": "Openers before the race",
  "Beine wach machen, nicht müde: die Antritte kurz und knackig, alles dazwischen wirklich locker.":
    "Wake the legs up, don't tire them: the efforts short and snappy, everything in between truly easy.",
  "Der stärkste Hebel für die FTP, wenn die Grundlage steht. Letztes Intervall darf hart sein, aber vollständig.":
    "The strongest lever for FTP once the base is there. The last interval may be hard, but complete.",
  "Hohe Zeit bei VO2max ohne die mentale Last langer Intervalle. Gut nach knappem Schlaf.":
    "A lot of time at VO2max without the mental load of long intervals. Good after a short night.",
  "Schwelle 3x12min": "Threshold 3x12min",
  "Brot-und-Butter für {ftp-ziel}. Zielbereich exakt halten, nicht überziehen.":
    "Bread and butter for {ftp-ziel}. Hold the target range exactly, don't overshoot.",
  "Schwelle 2x20min": "Threshold 2x20min",
  "Der klassische FTP-Test-Vorbereiter. Schaffst du 2x20 bei 100%, ist die FTP reif für ein Update.":
    "The classic preparation for an FTP test. If you manage 2x20 at 100%, your FTP is ripe for an update.",
  "Laktat-Toleranz an der Schwelle. Die Unders sind Erholung, nicht Pause — Druck halten.":
    "Lactate tolerance at threshold. The unders are recovery, not rest — keep the pressure on.",
  "Viel aerober Reiz bei geringen Kosten. Die Basis, auf der VO2max später greift.":
    "A lot of aerobic stimulus at low cost. The base on which VO2max takes hold later.",
  "Aerober Reiz, der am nächsten Tag nicht in den Beinen sitzt.":
    "Aerobic stimulus that is not in your legs the next day.",
  "Schwelle kompakt 3x8min": "Threshold compact 3x8min",
  "Der Einstieg in die Schwelle: drei kurze Blöcke an der FTP. Sauber durchgezogen, gibt sie 3x12 frei.":
    "The way into threshold work: three short blocks at FTP. Done cleanly, it unlocks 3x12.",
  "VO2max kompakt 4x3min": "VO2max compact 4x3min",
  "Kurz und scharf. Auch in der Taperwoche einsetzbar, um spritzig zu bleiben.":
    "Short and sharp. Also usable in taper week to stay snappy.",
  "Grundlage 75min": "Endurance 75min",
  "Fettstoffwechsel und Kapillarisierung. Auf der Rolle bewusst locker bleiben.":
    "Fat metabolism and capillarisation. Stay deliberately easy on the trainer.",
  "Regeneration 40min": "Recovery 40min",
  "Durchblutung ohne Reiz. Wenn es sich anstrengend anfühlt, ist es zu hart.":
    "Blood flow without stimulus. If it feels like effort, it is too hard.",
  "Lange Ausfahrt 90min": "Long ride 90min",
  "Die Basis, auf der alles andere steht. Durchgehend locker — wer hier drückt, verliert die Einheit am Dienstag.":
    "The base everything else stands on. Easy throughout — push here and you lose Tuesday's session.",
  "Lange Ausfahrt 2h": "Long ride 2h",
  "Zwei Stunden verlangen eine Verpflegungsstrategie. Trinken und essen ab der ersten halben Stunde, nicht erst bei Hunger.":
    "Two hours call for a fuelling strategy. Drink and eat from the first half hour, not only when hungry.",
  "Lange Ausfahrt 2,5h mit Schlussteil": "Long ride 2.5h with a hard finish",
  "Der Schlussteil auf müden Beinen ist der eigentliche Reiz — genau dort entscheidet sich ein langes Rennen.":
    "The finish on tired legs is the real stimulus — that is exactly where a long race is decided.",
  "Schlussteil auf müden Beinen": "Finish on tired legs",
  "Schwelle 5x1km": "Threshold 5x1km",
  "Die wichtigste Einheit für 10k. Kontrolliert schnell, nicht am Limit.":
    "The most important session for 10k. Fast under control, not at the limit.",
  "Einlaufen": "Warm-up",
  "Lange Schwellenintervalle. Direkt übertragbar auf 10k-Renntempo.":
    "Long threshold intervals. Carries straight over to 10k race pace.",
  "Hebt die Decke über dem Renntempo. Erste zwei Wiederholungen bewusst zurückhalten.":
    "Raises the ceiling above race pace. Hold back deliberately on the first two reps.",
  "Kurze, schnelle Reize bei geringer Ermüdung. Ideal in der letzten Woche vor einem Wettkampf.":
    "Short, fast stimuli at low fatigue. Ideal in the last week before a race.",
  "Tempodauerlauf 25min": "Tempo run 25min",
  "Komfortabel hart, durchgehend. Baut die Schwelle ohne die Kosten von Intervallen.":
    "Comfortably hard, continuous. Builds the threshold without the cost of intervals.",
  "Steigerungslauf 48min": "Progression run 48min",
  "Drei Blöcke, jeder schneller. Trainiert das Gefühl für gleichmäßig hartes Tempo.":
    "Three blocks, each faster. Trains the feel for evenly hard pace.",
  "Hügelsprints 8x20s": "Hill sprints 8x20s",
  "Kraft und Laufökonomie bei minimaler Ermüdung — der günstigste Weg zu schnellerem 10k-Tempo.":
    "Strength and running economy at minimal fatigue — the cheapest way to a faster 10k pace.",
  "Langer Lauf 80min": "Long run 80min",
  "Aerobe Basis. Bei zwei bis drei Einheiten pro Woche die einzige echte Volumenquelle.":
    "Aerobic base. With two or three sessions a week, the only real source of volume.",
  "Locker 40min + Steigerungen": "Easy 40min + strides",
  "Locker heißt locker. Die Steigerungen am Ende halten die Beine schnell.":
    "Easy means easy. The strides at the end keep the legs fast.",
  "Schwelle kompakt 3x1km": "Threshold compact 3x1km",
  "Die 40-Minuten-Version, wenn der Tag eng ist. Reiz bleibt, Umfang fällt.":
    "The 40-minute version for a tight day. The stimulus stays, the volume drops.",
  "Regenerationslauf 30min": "Recovery run 30min",
  "Ganz locker, gerne auf weichem Untergrund. Kein Blick auf die Uhr.":
    "Very easy, on soft ground if you can. No looking at the watch.",
  "Langer Lauf 100min": "Long run 100min",
  "Zwanzig Minuten mehr als die Stufe davor. Das Tempo bleibt, die Zeit macht die Arbeit.":
    "Twenty minutes more than the level before. The pace stays, the time does the work.",
  "Langer Lauf 2h mit schnellem Ende": "Long run 2h with a fast finish",
  "Die letzten zehn Minuten zügig, nicht schnell. Wer sie nicht mehr laufen kann, war vorher zu schnell unterwegs.":
    "The last ten minutes brisk, not fast. If you can no longer run them, you went too fast before.",
  "Schnelleres Ende": "Faster finish",
  "Renntempo 4x1,5km": "Race pace 4x1.5km",
  "Das Tempo, das am Wettkampftag zählt — einen Tick über der Schwelle, mit kurzen Pausen, damit es sich anfühlt wie das Rennen.":
    "The pace that counts on race day — a touch above threshold, with short rests so it feels like the race.",
  "Renntempo 3x2,5km": "Race pace 3x2.5km",
  "Längere Stücke bei gleichem Tempo. Wenn das dritte noch sitzt, sitzt auch das Rennen.":
    "Longer pieces at the same pace. If the third still holds, so will the race.",
  "Einschwimmen": "Warm-up",
  "Die Standardeinheit an der kritischen Schwimmgeschwindigkeit. Gleichmäßig, letzte 100 nicht schneller als die erste.":
    "The standard session at critical swim speed. Even, the last 100 no faster than the first.",
  "Technik": "Technique",
  "Längere Intervalle, gleicher Reiz. Näher am Renntempo für alles ab 750 m.":
    "Longer intervals, same stimulus. Closer to race pace for anything from 750 m up.",
  "Kurz und schnell bei sauberer Technik. Sobald der Zug zerfällt, ist die Serie zu Ende — egal wie viele übrig sind.":
    "Short and fast with clean technique. As soon as the stroke falls apart the set is over — no matter how many are left.",
  "Aerober Block ohne die Kosten harter Intervalle. Gut am Tag nach einer harten Lauf- oder Radeinheit.":
    "Aerobic block without the cost of hard intervals. Good the day after a hard run or ride.",
  "Technik 40min": "Technique 40min",
  "Im Schwimmen kommt der Fortschritt aus dem Wasserwiderstand, nicht aus der Kraft. Technik ist hier keine Zusatzeinheit, sondern die eigentliche Arbeit.":
    "In swimming, progress comes from drag, not from strength. Technique is not an extra session here but the actual work.",
  "Umsetzen": "Apply",
  "Grundlage 1500m": "Endurance 1500m",
  "Durchgehend locker. Auf gleichmäßige Zugfrequenz achten, nicht auf die Uhr.":
    "Easy throughout. Watch for an even stroke rate, not the clock.",
  "CSS kompakt 6x100m": "CSS compact 6x100m",
  "Die 35-Minuten-Version, wenn die Bahn nur kurz frei ist.":
    "The 35-minute version for when the lane is free only briefly.",
  "Lockeres Schwimmen 800m": "Easy swim 800m",
  "Regeneration im Wasser entlastet die Beine vollständig — nach harten Lauftagen oft die bessere Wahl als ein Regenerationslauf.":
    "Recovery in the water takes the load off the legs completely — after hard run days often the better choice than a recovery run.",
  "Standortbestimmung FTP 20min": "Threshold test FTP 20min",
  "Ein einziger maximaler Block, gleichmäßig gefahren — nicht die ersten fünf Minuten verheizen. Die FTP sind 95 % der Durchschnittsleistung über die 20 Minuten. Nur so ein Wert nach oben begrenzt die Schätzung; Intervalle können das nicht.":
    "One single maximal block, ridden evenly — don't burn the first five minutes. FTP is 95 % of the average power over the 20 minutes. Only a value like this bounds the estimate from above; intervals cannot.",
  "Maximal, gleichmäßig": "Maximal, even",
  "Standortbestimmung Schwelle 20min": "Threshold test run 20min",
  "Flache Runde, gleichmäßig laufen, nicht die ersten Minuten verschenken. Deine Schwellenpace liegt etwa 5 % über der Durchschnittszeit dieser 20 Minuten — schneller gelaufen heißt also auch: neue Zielpaces für alles danach.":
    "Flat loop, run evenly, don't give away the first minutes. Your threshold pace is about 5 % above the average time of these 20 minutes — running faster therefore also means: new target paces for everything after.",
  "Standortbestimmung CSS 400/200": "Threshold test CSS 400/200",
  "Zwei maximale Strecken: erst 400 m, dann nach lockerem Schwimmen 200 m, beide gleichmäßig und so schnell wie möglich. Aus der Zeitdifferenz ergibt sich deine CSS: (Zeit 400 − Zeit 200) ÷ 2 pro 100 m.":
    "Two maximal efforts: first 400 m, then after easy swimming 200 m, both even and as fast as possible. The time difference gives your CSS: (time 400 − time 200) ÷ 2 per 100 m.",
  "Steigern": "Build",
  "Locker": "Easy",
  "Formkontrolle Rad 4x4min": "Form check bike 4x4min",
  "Vergleichseinheit. Immer identisch fahren — gleiche Watt, gleiche Trittfrequenz. Sinkt die Herzfrequenz bei gleicher Leistung, bist du besser geworden.":
    "Comparison session. Always ride it identically — same watts, same cadence. If heart rate drops at the same power, you have got better.",
  "Formkontrolle Lauf 4x4min": "Form check run 4x4min",
  "Vergleichseinheit. Gleiche Pace wie beim letzten Mal, nicht schneller. Die Herzfrequenz ist das Ergebnis, nicht die Zeit.":
    "Comparison session. Same pace as last time, not faster. Heart rate is the result, not the time.",
  "Formkontrolle Schwimmen 400m": "Form check swim 400m",
  "Vergleichseinheit. 400 m gleichmäßig auf CSS-Tempo, danach dieselbe Auswertung wie bei Rad und Lauf.":
    "Comparison session. 400 m evenly at CSS pace, then the same evaluation as for bike and run.",
  "Kniebeuge / Beinpresse": "Squat / leg press",
  "~85 % 1RM": "~85 % 1RM",
  "Rumänisches Kreuzheben": "Romanian deadlift",
  "3 × 6 je Seite": "3 × 6 per side",
  "Einbeiniges Wadenheben": "Single-leg calf raise",
  "Rumpf (Plank, Pallof Press)": "Core (plank, Pallof press)",
  "2 Sätze": "2 sets",
  "Vorweg: Hops / Drop Jumps": "First: hops / drop jumps",
  "Körpergewicht": "Bodyweight",
  "4 × 6 je Seite": "4 × 6 per side",
  "Einbeiniges Kreuzheben": "Single-leg deadlift",
  "3 × 8 je Seite": "3 × 8 per side",
  "Wadenheben einbeinig, Ferse erhöht": "Single-leg calf raise, heel elevated",
  "4 × 10 je Seite": "4 × 10 per side",
  "Step-up auf hohe Stufe": "Step-up onto a high step",
  "Vorweg: Drop Jumps / Bounding": "First: drop jumps / bounding",
  "Einbeinige Kniebeuge zum Stuhl": "Single-leg squat to a chair",
  "3s abwärts": "3s down",
  "Nordic Hamstring Curl (Füße fixiert)": "Nordic hamstring curl (feet fixed)",
  "so langsam wie möglich": "as slowly as possible",
  "4 × 15 je Seite": "4 × 15 per side",
  "3 × 30s je Seite": "3 × 30s per side",
  "tiefe Position halten": "hold the low position",
  "Rumpf (Plank, Pallof Press mit Band)": "Core (plank, Pallof press with band)",
  "Bei leichten Hanteln entsteht der Reiz durch die einbeinige Ausführung — die letzte Wiederholung muss hart sein, sonst geht das Gewicht hoch oder die Stufe höher.":
    "With light dumbbells the stimulus comes from doing it on one leg — the last rep has to be hard, otherwise the weight goes up or the step higher.",
  "Ohne Zusatzgewicht tragen die langsame Absenkphase und die Sprünge den Reiz. Sprünge immer ausgeruht zu Beginn, nie am Ende der Einheit.":
    "Without added weight the slow lowering phase and the jumps carry the stimulus. Jumps always fresh at the start, never at the end of the session.",
  "Einstieg: nur zwei Übungen, moderate Last. Muskelkater darf die nächste Qualitätseinheit nicht treffen.":
    "Introduction: only two exercises, moderate load. Soreness must not hit the next quality session.",
  "Volles Programm, zweimal pro Woche. 2 Wiederholungen in Reserve, kein Muskelversagen — Ziel ist neuromuskuläre Anpassung, nicht Masse.":
    "Full programme, twice a week. 2 reps in reserve, no failure — the aim is neuromuscular adaptation, not mass.",
  "Erhalt: einmal pro Woche genügt jetzt. Die frei werdende Zeit gehört wieder der Ausdauer.":
    "Maintenance: once a week is enough now. The time freed belongs to endurance again.",
  "Krafttraining": "Strength training",
  "{0}{1} Am selben Tag wie die harte Ausdauereinheit — direkt danach oder mindestens 6h später, nie am Tag davor.":
    "{0}{1} On the same day as the hard endurance session — right after it or at least 6h later, never the day before.",
  "Aufbau": "Build",
  "Spezifisch": "Specific",
  "Tapering": "Taper",
  "Erholungswoche": "Recovery week",
  "auf {0}": "over {0}",
  "{0} — Erholungswoche: das Rennen nur freiwillig, die Alternative bleibt locker":
    "{0} — recovery week: the race is optional only, the alternative stays easy",
  "{0} · {1} nur, wenn es sich gut anfühlt": "{0} · {1} only if it feels good",
  "Achtung: die letzte harte Einheit ist keine 48 h her.":
    "Careful: the last hard session was less than 48 h ago.",
  "{0} — Rennen oder eine gleichwertige Qualitätseinheit.{1}":
    "{0} — race or an equivalent quality session.{1}",
  "Morgen {0} — heute locker mit kurzen Antritten, damit die Beine wach sind":
    "Tomorrow {0} — easy today with short efforts so the legs are awake",
  "{0} · geschätzt {1} min mit Aufwärmen, {2} TSS{3}":
    "{0} · estimated {1} min with warm-up, {2} TSS{3}",
  "· freiwillig": "· optional",
  "HRV {0} deutlich unter Baseline ({1})": "HRV {0} clearly below baseline ({1})",
  "HRV {0} unter Baseline ({1})": "HRV {0} below baseline ({1})",
  "Ruhepuls {0} deutlich über Baseline ({1})": "Resting HR {0} clearly above baseline ({1})",
  "Ruhepuls {0} über Baseline ({1})": "Resting HR {0} above baseline ({1})",
  "Nur {0}h Schlaf": "Only {0}h of sleep",
  "Subjektiv sehr müde / schwere Beine": "Subjectively very tired / heavy legs",
  "Subjektiv müde": "Subjectively tired",
  "Form {0} — deutliche Überlastung": "Form {0} — clear overload",
  "Form {0} — hohe Ermüdung": "Form {0} — high fatigue",
  "Keine Warnsignale": "No warning signs",
  "Gekürzte Fassung: gleiche Intervalllänge, gleiche Zielwerte, weniger Volumen. Der Reiz bleibt, die Zeit nicht.":
    "Shortened version: same interval length, same targets, less volume. The stimulus stays, the time does not.",
  "Verlängerte Fassung: Intervalle und Zielwerte bleiben, wie sie sind — die zusätzliche Zeit ist lockere Grundlage, kein zweiter Reiz.":
    "Extended version: intervals and targets stay as they are — the extra time is easy endurance, not a second stimulus.",
  "die Schwelle": "threshold",
  "{0} · {1} von {2} im Ziel {3}": "{0} · {1} of {2} on target {3}",
  "{0} · {1} min": "{0} · {1} min",
  "Im Ziel {0} von {1}": "On target {0} of {1}",
  "intervals.icu misst {0}, eingestellt sind {1} — {2} %":
    "intervals.icu measures {0}, the setting is {1} — {2} %",
  "{0} besser. Diese Leistung hast du nachweislich erbracht, deine Vorgaben sind also zu leicht geworden.":
    "{0} better. You have demonstrably produced this power, so your targets have become too easy.",
  "{0} schwächer. Der Schätzwert kann aber nur abbilden, was du versucht hast — fehlen maximale Belastungen, sinkt er von selbst. Bestätige ihn mit der Standortbestimmung, bevor du den Wert senkst.":
    "{0} weaker. But the estimate can only reflect what you attempted — without maximal efforts it sinks by itself. Confirm it with the threshold test before you lower the value.",
  "Aus deiner Standortbestimmung: {0} statt {1}.": "From your threshold test: {0} instead of {1}.",
  "Das ist gemessen, nicht geschätzt — alle Vorgaben sollten jetzt darauf stehen.":
    "That is measured, not estimated — all targets should now be based on it.",
  "und": "and",
  "Deine Intervalle am {0} lagen im Schnitt {1} Punkte über dem Zielbereich.":
    "Your intervals on {0} were on average {1} points above the target range.",
  "Das passt zu einer Schwelle von {0} statt {1} — die Vorgaben sind zu leicht geworden.":
    "That fits a threshold of {0} instead of {1} — the targets have become too easy.",
  "Deine Intervalle am {0} lagen im Schnitt {1} Punkte unter dem Zielbereich.":
    "Your intervals on {0} were on average {1} points below the target range.",
  "Rechnerisch wären das {0} statt {1}. Müde Beine sehen genauso aus — bestätige es mit der Standortbestimmung, bevor du den Wert senkst.":
    "By the numbers that would be {0} instead of {1}. Tired legs look just the same — confirm it with the threshold test before you lower the value.",
  "Standortbestimmung: deine Schwelle ist bisher nie gemessen worden. Aus Intervallen lässt sie sich nur nach unten begrenzen, nie nach oben — alle Vorgaben hängen aber daran.":
    "Threshold test: your threshold has never been measured so far. Intervals can only bound it from below, never from above — yet every target depends on it.",
  "Standortbestimmung: die letzte liegt {0} Wochen zurück. Zeit, den Wert wieder zu belegen statt ihn fortzuschreiben.":
    "Threshold test: the last one was {0} weeks ago. Time to prove the value again instead of carrying it forward.",
  "Rad": "Bike",
  "Laufen": "Run",
  "Schwimmen": "Swim",
  "Schwelle": "Threshold",
  "Antritte": "Sprints",
  "Grundlage": "Endurance",
  "Lange Einheit": "Long session",
  "Regeneration": "Recovery",
  "lang": "long",
  "mehr Zeit": "more time",
  "Punkterennen": "Points race",
  "Mannschaftszeitfahren": "Team time trial",
  "Studio / Langhantel": "Gym / barbell",
  "Kurzhanteln bis 10 kg": "Dumbbells up to 10 kg",
  "Nur Körpergewicht": "Bodyweight only",
  "{0} auf {1} min": "{0} to {1} min",
  "{0}{1} statt {2}{3} Intervalle": "{0}{1} instead of {2}{3} intervals",
  "Hauptteil {0} statt {1} min": "Main set {0} instead of {1} min",
  "{0} + {1}min Grundlage": "{0} + {1}min endurance",
  "{0} min lockere Grundlage vor dem Hauptteil, Intervalle ab Minute {1}":
    "{0} min easy endurance before the main set, intervals from minute {1}",
  "{0} min lockere Grundlage nach dem Hauptteil": "{0} min easy endurance after the main set",
  "Du bist ausgeruht": "You are rested",
  "Belastung und Erholung halten sich die Waage": "Load and recovery are in balance",
  "Du trägst etwas Ermüdung mit, das gehört zum Training":
    "You are carrying some fatigue, that is part of training",
  "Du bist deutlich ermüdet": "You are clearly fatigued",
  "Du bist überlastet": "You are overloaded",
  "{0} (Form {1}, Fitness {2}, Ermüdung {3}).": "{0} (form {1}, fitness {2}, fatigue {3}).",
  "Heute schon trainiert – der Rest des Tages gehört der Erholung.":
    "Already trained today – the rest of the day belongs to recovery.",
  "Dein Körper braucht Erholung – heute ist Pause.":
    "Your body needs recovery – today is a rest day.",
  "Heute ist Pause – Erholung gehört zum Training.":
    "Today is a rest day – recovery is part of training.",
  "Deine Erholungswerte sind schwach – heute nur ganz locker.":
    "Your recovery values are weak – only very easy today.",
  "Du bist stark ermüdet – heute nur ganz locker.":
    "You are heavily fatigued – only very easy today.",
  "Heute nur ganz locker – Regeneration hat Vorrang.":
    "Only very easy today – recovery comes first.",
  "Deine Erholungswerte liegen unter normal – heute locker.":
    "Your recovery values are below normal – easy today.",
  "Du bist müde vom Training – heute locker.": "You are tired from training – easy today.",
  "Heute locker – die nächste harte Einheit kommt bald.":
    "Easy today – the next hard session is coming soon.",
  "Deine Erholungswerte sind schwach – hart nur, wenn du dich wirklich gut fühlst.":
    "Your recovery values are weak – go hard only if you really feel good.",
  "Kleine Warnsignale – hart nur, wenn es sich gut anfühlt.":
    "Small warning signs – go hard only if it feels good.",
  "Du bist erholt – heute darf es hart sein.": "You are recovered – today may be hard.",
  "Du bist bereit – heute darf es hart sein.": "You are ready – today may be hard.",
  "Format offen": "Format open",
  "Grobe Schätzung — es fehlen eigene Rennen dieser Art oder die Route. Nach dem Rennen wird sie genauer.":
    "Rough estimate — races of your own of this kind, or the route, are missing. After the race it gets more accurate.",
  "Geschätzt aus {0} deiner Rennen dieser Art. Nicht dabei? Die Alternative daneben hält die Woche genauso.":
    "Estimated from {0} of your races of this kind. Not racing? The alternative next to it keeps the week just as well.",
  "Aufwärmen": "Warm-up",
  "Ansicht": "View",
  "Plan": "Plan",
  "Verlauf": "Progress",
  "Unbekannter Fehler": "Unknown error",
  "Erneut versuchen": "Try again",
  "Einen Moment…": "One moment…",
  "Schwelle 4 × 6′": "Threshold 4 × 6′",
  "Sweetspot 2 × 10′ · Kurzfassung": "Sweetspot 2 × 10′ · short version",
  "Beispiel: so sieht ein Tag in Etmal aus":
    "Example: this is what a day in Etmal looks like",
  "Heute · Beispiel": "Today · example",
  "Qualitätstag": "Quality day",
  "oder": "or",
  "Derselbe Reiz, egal welche du nimmst.": "The same stimulus, whichever you take.",
  "Der Tagesplan: Form, Fitness und Ermüdung, darunter die Einheiten für heute zur Wahl":
    "The daily plan: form, fitness and fatigue, below them today's sessions to choose from",
  "Jeden Morgen neu: jede deiner Sportarten als Wahl, komplett oder kurz.":
    "New every morning: each of your sports as a choice, complete or short.",
  "Ein Lauf mit vier Intervallen über den Zielkorridoren, je Intervall die gehaltene Prozentzahl":
    "A run with four intervals over the target corridors, with the percentage held for each interval",
  "Danach: Intervall für Intervall, ob du im Ziel warst.":
    "Afterwards: interval by interval, whether you were on target.",
  "Der Verlauf: Fitnesskurve, Saisonphasen und Wochenlast":
    "Progress: fitness curve, season phases and weekly load",
  "Und über Wochen: ob du vorankommst.": "And over weeks: whether you are getting anywhere.",
  "Anmelden": "Sign in",
  "Ein Klick über intervals.icu. Kein neues Passwort, keine API-Schlüssel zum Kopieren.":
    "One click via intervals.icu. No new password, no API keys to copy.",
  "Einrichten": "Set up",
  "Sportarten wählen, dazu wie oft und wie lange du realistisch trainierst. Ein Ziel ist optional: Wettkampf, FTP oder einfach fit bleiben.":
    "Choose your sports, and how often and how long you realistically train. A goal is optional: a race, FTP or simply staying fit.",
  "Loslegen": "Go",
  "Jeden Morgen stehen die nächsten drei Tage bereit. Einheit wählen, per Klick auf Uhr, Radcomputer oder Rolle.":
    "Every morning the next three days are ready. Choose a session, send it to watch, bike computer or trainer with one click.",
  "Zugriff wurde abgelehnt. Ohne Freigabe kann der Plan deine Daten nicht lesen.":
    "Access was denied. Without permission the plan cannot read your data.",
  "Ohne Einwilligung in die Verarbeitung deiner Gesundheitsdaten ist keine Anmeldung möglich.":
    "Without consent to the processing of your health data no sign-in is possible.",
  "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.":
    "Your sign-in has expired. Please sign in again.",
  "Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.":
    "The sign-in failed. Please try again.",
  "Das hat nicht geklappt.": "That did not work.",
  "Fast geschafft.": "Almost there.",
  "Wir haben dir eine Mail geschickt — erst mit dem Klick darin stehst du auf der Liste.":
    "We have sent you an email — only the click in it puts you on the list.",
  "Sag mir Bescheid, wenn Etmal offen ist": "Tell me when Etmal opens",
  "deine@mail.de": "you@mail.com",
  "Eintragen": "Enter",
  "Website": "Website",
  "Eine Mail zum Start, sonst nichts. Du bestätigst per Link, abmelden geht jederzeit. Mehr in der":
    "One email at launch, nothing else. You confirm by link, and can unsubscribe at any time. More in the",
  "Datenschutzerklärung": "privacy policy",
  "Ich willige ein, dass meine Trainings- und Gesundheitsdaten aus intervals.icu — Herzfrequenz, Herzratenvariabilität, Ruhepuls und Schlaf — zur Berechnung meines Trainingsplans verarbeitet werden (Art. 9 Abs. 2 lit. a DSGVO). Widerruf jederzeit möglich. Näheres in der":
    "I consent to my training and health data from intervals.icu — heart rate, heart-rate variability, resting heart rate and sleep — being processed to calculate my training plan (Art. 9(2)(a) GDPR). Consent can be withdrawn at any time. Details in the",
  "Mit intervals.icu anmelden": "Sign in with intervals.icu",
  "Kostenlos in der Beta. Du brauchst ein intervals.icu-Konto, fürs Rad einen Wattmesser.":
    "Free during the beta. You need an intervals.icu account, and a power meter for the bike.",
  "Etmal": "Etmal",
  "Wahl statt Plan: Du entscheidest spontan, der Trainingsreiz stimmt trotzdem.":
    "Choice instead of a plan: you decide on the spot, and the training stimulus is still right.",
  "Etmal liest deine Einheiten und Erholungswerte aus intervals.icu und schlägt jeden Tag eine Einheit für":
    "Etmal reads your sessions and recovery values from intervals.icu and proposes one session a day for",
  "jede": "each",
  "deiner Sportarten vor – Rad, Laufen, Schwimmen –, jeweils komplett und als Kurzfassung. Verpasst du einen Tag, verschiebt sich der Plan, statt zu brechen.":
    "of your sports – bike, run, swim – each complete and as a short version. Miss a day and the plan shifts instead of breaking.",
  "Bestätigt.": "Confirmed.",
  "Du stehst auf der Liste und hörst von uns, sobald Etmal offen ist.":
    "You are on the list and will hear from us as soon as Etmal opens.",
  "So sieht es aus": "What it looks like",
  "Warum eine Einheit pro Sportart?": "Why one session per sport?",
  "Weil Zeit der eigentliche Engpass ist. Mal passt die Rolle, mal sind die Laufschuhe schneller angezogen, mal bleiben nur 30 Minuten. Alle Vorschläge eines Tages setzen denselben Trainingsreiz – welche Sportart und welche Länge du wählst, ändert den Plan nicht, nur den Weg dahin. Und fällt ein Tag aus, rechnet Etmal am nächsten Morgen einfach mit dem, was wirklich passiert ist.":
    "Because time is the real bottleneck. Sometimes the trainer fits, sometimes the running shoes are on faster, sometimes only 30 minutes are left. All of a day's proposals set the same training stimulus – which sport and which length you choose does not change the plan, only the way there. And if a day falls through, Etmal simply works the next morning with what really happened.",
  "So läuft es": "How it works",
  "Was der Plan berücksichtigt": "What the plan takes into account",
  "Fitness, Ermüdung und Form aus all deinen Einheiten – Rad, Laufen und Schwimmen":
    "Fitness, fatigue and form from all your sessions – bike, run and swim",
  "HRV, Ruhepuls und Schlaf im Vergleich zu deiner eigenen Baseline der letzten 30 Tage":
    "HRV, resting heart rate and sleep compared with your own baseline of the last 30 days",
  "Mindestens 48 Stunden zwischen zwei harten Einheiten":
    "At least 48 hours between two hard sessions",
  "Periodisierung auf dein Zieldatum, wenn du eins hast, sonst in Blöcken – jede vierte Woche ist leichter":
    "Periodisation towards your target date if you have one, otherwise in blocks – every fourth week is lighter",
  "Dein Zeitbudget: keine 90-Minuten-Einheit, wenn du 45 Minuten hast":
    "Your time budget: no 90-minute session when you have 45 minutes",
  "Vorgaben in Watt fürs Rad, als Pace fürs Laufen und pro 100 m fürs Schwimmen. Ohne Wattmesser oder Smart-Trainer lässt sich der Radplan noch nicht sinnvoll fahren.":
    "Targets in watts for the bike, as pace for running and per 100 m for swimming. Without a power meter or smart trainer the bike plan cannot yet be ridden sensibly.",
  "Deine Daten": "Your data",
  "Die Anmeldung läuft über intervals.icu. Etmal fragt vier Berechtigungen an: Aktivitäten lesen, Erholungswerte lesen, geplante Einheiten in deinen Kalender schreiben und Einstellungen ändern. Über die Einstellungen liest Etmal deine Schwellenwerte und verbundenen Geräte; ändern tut es sie nur, wenn du es anklickst. Kein Zugriff auf dein Passwort, und Etmal löscht nichts. Du kannst die Freigabe jederzeit in deinen intervals.icu-Einstellungen widerrufen.":
    "Sign-in runs through intervals.icu. Etmal asks for four permissions: read activities, read recovery values, write planned sessions to your calendar and change settings. Through the settings Etmal reads your thresholds and connected devices; it changes them only when you click to. No access to your password, and Etmal deletes nothing. You can withdraw the permission at any time in your intervals.icu settings.",
  "Datenschutz": "Privacy",
  "Impressum": "Imprint",
  "Kein konkretes Ziel – fit bleiben": "No specific goal – stay fit",
  "Wettkampf – eine Zielzeit": "Race – a target time",
  "FTP steigern": "Raise FTP",
  "Bitte die markierten Felder prüfen.": "Please check the marked fields.",
  "Wähl mindestens eine Sportart.": "Choose at least one sport.",
  "Speichern fehlgeschlagen": "Saving failed",
  "Kurz einrichten": "Quick setup",
  "Zwei Minuten. Alles lässt sich später ändern.": "Two minutes. Everything can be changed later.",
  "Was trainierst du": "What do you train",
  "Der Plan zeigt für jeden Tag zu jeder gewählten Sportart eine Einheit — du nimmst die, für die du Zeit hast. FTP, Laufpace und CSS holt er, wenn möglich, aus deinen intervals.icu-Einstellungen.":
    "For every day the plan shows one session for each sport chosen — you take the one you have time for. Where possible it fetches FTP, run pace and CSS from your intervals.icu settings.",
  "Gewicht (kg)": "Weight (kg)",
  "Krafttraining mit": "Strength training with",
  "Was willst du erreichen": "What do you want to achieve",
  "Der Plan wechselt Grundlage und Aufbau in Vier-Wochen-Blöcken und setzt ab und zu eine Standortbestimmung. Ein Ziel kannst du jederzeit in den Einstellungen anlegen.":
    "The plan alternates base and build in four-week blocks and schedules a threshold test now and then. You can add a goal in the settings at any time.",
  "Wie viel Zeit hast du": "How much time do you have",
  "Das Minimum ist dein Vorsatz — der Plan sagt dir, wenn du drunter liegst. Das Maximum steuert, wie viele harte Einheiten pro Woche eingeplant werden.":
    "The minimum is your resolution — the plan tells you when you fall below it. The maximum controls how many hard sessions are scheduled per week.",
  "Einheiten / Woche mindestens": "Sessions / week at least",
  "Einheiten / Woche höchstens": "Sessions / week at most",
  "Minuten — schaffe ich immer": "Minutes — I always manage",
  "Minuten — normalerweise": "Minutes — normally",
  "Minuten — wenn viel Zeit ist": "Minutes — when there is plenty of time",
  "Plan erstellen": "Create plan",
  "Anmeldung fehlgeschlagen": "Sign-in failed",
  "Ein Trainingsplaner, der die nächsten drei Tage aus dem plant, was wirklich trainiert wurde. Die Demo zeigt ihn an einer erfundenen Athletin mit einem Jahr Beispieldaten. Was du änderst, siehst nur du, und nach zwei Stunden ist es wieder vergessen.":
    "A training planner that plans the next three days from what was really trained. The demo shows it on an invented athlete with a year of sample data. What you change only you see, and after two hours it is forgotten again.",
  "Angemeldet bleibst du 30 Tage. Jeder Besuch verlängert das wieder — nach einem Monat ohne Nutzung fragt der Coach erneut.":
    "You stay signed in for 30 days. Every visit extends that — after a month without use the coach asks again.",
  "Passwort": "Password",
  "Demo öffnen": "Open demo",
  "Wie geplant": "As planned",
  "Hart": "Hard",
  "Lade Daten von intervals.icu…": "Loading data from intervals.icu…",
  "Wie soll heute werden?": "How should today be?",
  "Stand:": "As of:",
  "Angemeldet als": "Signed in as",
  "Einwilligung": "Consent",
  "Rechtliches und Konto": "Legal and account",
  "Abmelden": "Sign out",
  "30 Tage": "30 days",
  "90 Tage": "90 days",
  "180 Tage": "180 days",
  "1 Jahr": "1 year",
  "Stufe nicht gespeichert": "Level not saved",
  "Lade Verlauf von intervals.icu…": "Loading progress from intervals.icu…",
  "Zeitraum": "Period",
  "Noch am Anfang": "Early days",
  "Nach etwa zwei Wochen Training siehst du hier, wie sich deine Fitness entwickelt, wie viel du pro Woche trainierst und auf welcher Stufe du je Trainingsart stehst. Bis dahin reicht der Plan: einfach die Einheit des Tages machen.":
    "After about two weeks of training you will see here how your fitness develops, how much you train per week and which level you are on for each kind of training. Until then the plan is enough: just do the session of the day.",
  "Erreicht": "Achieved",
  "Tage": "days",
  "Einheiten": "Sessions",
  "Stunden": "Hours",
  "Load gesamt": "Total load",
  "Tage trainiert": "Days trained",
  "Längste Pause": "Longest break",
  "Ø pro Woche": "Avg per week",
  "Formkontrolle": "Form check",
  "noch nie durchgeführt": "never done yet",
  "zuletzt vor {0} Wochen": "last done {0} weeks ago",
  "Fällig — steht am nächsten Qualitätstag im Plan.":
    "Due — it is in the plan on the next quality day.",
  "Wieder fällig in {0} Wochen.": "Due again in {0} weeks.",
  "Fehler": "Error",
  "Pause beenden": "End break",
  "Längere Pause": "Longer break",
  "Grund": "Reason",
  "Trägt ein…": "Entering…",
  "Abbrechen": "Cancel",
  "Solange sie läuft, plant der Coach nichts Hartes und rechnet die Woche nicht als verpasst. Danach kommt die Intensität schrittweise zurück, nicht auf einen Schlag.":
    "While it runs the coach plans nothing hard and does not count the week as missed. Afterwards intensity comes back step by step, not all at once.",
  "Deine Aktivitäten kommen bei diesem Plan nicht an":
    "Your activities are not reaching this plan",
  "von": "of",
  "Einheiten der letzten 180 Tage stammen aus Strava. Strava untersagt intervals.icu, diese Daten über die API weiterzugeben — sie kommen hier als leere Hülle an, ohne Sportart und ohne Trainingsbelastung. Deshalb stehen Fitness, Ermüdung und Form auf 0, obwohl in intervals.icu selbst alles korrekt steht.":
    "sessions of the last 180 days come from Strava. Strava forbids intervals.icu to pass this data on through the API — it arrives here as an empty shell, without sport and without training load. That is why fitness, fatigue and form stand at 0, although everything is correct in intervals.icu itself.",
  "So behebst du es:": "How to fix it:",
  "verbinde deine Uhr direkt mit intervals.icu, statt den Umweg über Strava zu nehmen — in den":
    "connect your watch directly to intervals.icu instead of taking the detour via Strava — in the",
  "intervals.icu-Einstellungen": "intervals.icu settings",
  "unter Garmin Connect, Wahoo, Polar oder Suunto. Direkt importierte Aktivitäten unterliegen der Sperre nicht. Deine Strava-Verbindung kannst du daneben bestehen lassen.":
    "under Garmin Connect, Wahoo, Polar or Suunto. Directly imported activities are not subject to the block. You can keep your Strava connection alongside.",
  "Keine Trainingsbelastung in deinen Einheiten": "No training load in your sessions",
  "Heute": "Today",
  "Morgen": "Tomorrow",
  "Kein Vorschlag": "No proposal",
  "Ausblick: so sieht der Tag aus, wenn bis dahin alles wie geplant läuft. Was du vorher trainierst oder auslässt, verschiebt ihn.":
    "Outlook: this is what the day looks like if everything goes as planned until then. What you train or skip before shifts it.",
  "Hintergrund": "Background",
  "Einheit wählen": "Choose session",
  "min": "min",
  "TSS": "TSS",
  "empfohlen": "recommended",
  "Heute ist Pause.": "Today is a rest day.",
  "Tippe eine Sportart an, wenn du trotzdem los willst.": "Tap a sport if you want to go anyway.",
  "Löschen fehlgeschlagen": "Deleting failed",
  "Konto": "Account",
  "Gelöscht werden dein Zugangs-Token, deine Ziele und Einstellungen sowie das Protokoll deiner Krafteinheiten, und Etmal gibt die Freigabe bei intervals.icu zurück. Deine Daten bei intervals.icu bleiben unberührt — auch bereits in den Kalender geschriebene Einheiten. Das lässt sich nicht rückgängig machen.":
    "Deleted are your access token, your goals and settings and the log of your strength sessions, and Etmal returns its permission at intervals.icu. Your data at intervals.icu stays untouched — including sessions already written to the calendar. This cannot be undone.",
  "Löscht…": "Deleting…",
  "Endgültig löschen": "Delete for good",
  "Löscht alles, was diese App über dich gespeichert hat, und widerruft damit deine Einwilligung. Ohne Löschung geschieht das automatisch zwölf Monate nach deinem letzten Besuch.":
    "Deletes everything this app has stored about you, and thereby withdraws your consent. Without deletion this happens automatically twelve months after your last visit.",
  "Konto und Daten löschen": "Delete account and data",
  "Erfundene Athletin, erfundene Einheiten. Deine Änderungen verfallen nach zwei Stunden.":
    "Invented athlete, invented sessions. Your changes expire after two hours.",
  "Demo mit Beispieldaten": "Demo with sample data",
  "nur Kalender": "calendar only",
  "Übertragen an, pro Sportart": "Send to, per sport",
  "✓ Erledigt": "✓ Done",
  "min ·": "min ·",
  "~{0} TSS geschätzt": "~{0} TSS estimated",
  "· {0} % Übereinstimmung": "· {0} % compliance",
  "· {0} von {1} Sätzen erkannt": "· {0} of {1} sets found",
  "Die Vorschläge unten stehen so, wie sie heute vor der Einheit geplant waren. Was du trainiert hast, zählt ab morgen.":
    "The proposals below stand as they were planned today before the session. What you trained counts from tomorrow.",
  "Die Ansicht konnte nicht aufgebaut werden": "The view could not be built",
  "Neu laden hilft meistens. Bleibt es dabei, hilft der genaue Text oben beim Finden der Ursache.":
    "Reloading usually helps. If it stays, the exact text above helps to find the cause.",
  "Neu laden": "Reload",
  "Steht jetzt in der Beschreibung auf Strava.": "Now in the description on Strava.",
  "Auf Strava nicht gefunden — ist die Einheit dort schon hochgeladen?":
    "Not found on Strava — has the session been uploaded there yet?",
  "Strava hat gerade nicht geantwortet. Später noch einmal versuchen.":
    "Strava did not answer just now. Try again later.",
  "Bild teilen": "Share image",
  "Auf Strava erneuern": "Renew on Strava",
  "Auf Strava ergänzen": "Add on Strava",
  "Auf Strava ✓": "On Strava ✓",
  "Bild ließ sich nicht erzeugen.": "The image could not be created.",
  "im Ziel": "on target",
  "zu hart": "too hard",
  "zu leicht": "too easy",
  "nicht eindeutig": "unclear",
  "nicht gefunden": "not found",
  "Ohne Watt und Puls aufgezeichnet. Belastung und Sätze sind aus Tempo und Höhenprofil geschätzt":
    "Recorded without power and heart rate. Load and sets are estimated from speed and elevation profile",
  "Sätzen erkannt": "sets found",
  "Satz": "Set",
  "ab": "from",
  "(Ziel": "(target",
  "Wind und Sitzposition sind unbekannt: bei Wind können die Watt um ein Drittel daneben liegen, die Lage der Sätze kaum.":
    "Wind and riding position are unknown: with wind the watts can be off by a third, the position of the sets hardly at all.",
  "{0} Intervalle geplant, {1} im Zielbereich": "{0} intervals planned, {1} in the target range",
  "Intervall {0}: {1}, {2} von {3}{4}": "Interval {0}: {1}, {2} of {3}{4}",
  "nicht {0}": "not {0}",
  ", mit Unterbrechung": ", with an interruption",
  ", abgebrochen": ", abandoned",
  "Soll-Ist-Vergleich gerade nicht verfügbar.": "Planned vs. actual is not available right now.",
  "Soll-Ist-Vergleich wird geladen…": "Loading planned vs. actual…",
  "Ziel {0}–{1} %": "Target {0}–{1} %",
  "Soll und Ist: {0}": "Planned and actual: {0}",
  "Im Zielbereich": "In the target range",
  "Inter­vall­zeit": "Interval time",
  "Dauer": "Duration",
  "Belastung": "Load",
  "Formkontrolle:": "Form check:",
  "Zielkorridor": "Target corridor",
  "Zeit im Korridor": "Time in corridor",
  "-s-Mittel": " s average",
  "Puls": "Heart rate",
  "Puls geschätzt": "Heart rate estimated",
  "daneben": "off target",
  "Intervall für Intervall": "Interval by interval",
  "{0} über {1} Minuten": "{0} over {1} minutes",
  ", {0} von {1} Intervallen im Zielbereich": ", {0} of {1} intervals in the target range",
  "Tippen oder darüberfahren für Werte": "Tap or hover for values",
  "Fitness und Ermüdung": "Fitness and fatigue",
  "Fitness heute {0}, Höchstwert {1} am {2}.": "Fitness today {0}, peak {1} on {2}.",
  "Ermüdung heute {0}. Form {1} {2}.": "Fatigue today {0}. Form {1} {2}.",
  "Fitness": "Fitness",
  "Ermüdung": "Fatigue",
  "Form": "Form",
  "· Bestwert": "· best",
  "Teilweise abgeleitet aus Daten von Garmin-Geräten: {0}":
    "Partly derived from data from Garmin devices: {0}",
  "Teilweise abgeleitet aus Daten von Garmin-Geräten":
    "Partly derived from data from Garmin devices",
  "Bezeichnung": "Name",
  "wird aus den Werten gebildet": "is formed from the values",
  "FTP-Ziel (W)": "FTP goal (W)",
  "· jetzt {0} W": "· now {0} W",
  "Sportart": "Sport",
  "Distanz (": "Distance (",
  "aktuelle Zeit": "current time",
  "aktuelle Zeit (optional)": "current time (optional)",
  "38:00 oder 1:45:00": "38:00 or 1:45:00",
  "geschätzt {0}": "estimated {0}",
  "Zielzeit": "Target time",
  "36:00 oder 1:39:00": "36:00 or 1:39:00",
  "bis wann (optional)": "by when (optional)",
  "Priorität": "Priority",
  "A – Hauptziel": "A – main goal",
  "B – Nebenziel": "B – secondary goal",
  "Ziel entfernen": "Remove goal",
  "nicht realistisch": "not realistic",
  "ohne Zieldatum": "no target date",
  "Ziele": "Goals",
  "Kein konkretes Ziel – fit bleiben. Der Plan wechselt Grundlage und Aufbau in Vier-Wochen-Blöcken; ein Ziel legst du in den Einstellungen an.":
    "No specific goal – stay fit. The plan alternates base and build in four-week blocks; you add a goal in the settings.",
  "Das hat nicht geklappt. Bitte versuch es noch einmal.": "That did not work. Please try again.",
  "Der Schnitt der Einheit wird {0} statt {1} bpm.":
    "The session average becomes {0} instead of {1} bpm.",
  "Puls in intervals.icu korrigiert.": "Heart rate corrected in intervals.icu.",
  "Ein Vermerk an der Aktivität sagt, was geändert wurde.":
    "A note on the activity says what was changed.",
  "Der Vermerk an der Aktivität ließ sich nicht anlegen.":
    "The note on the activity could not be created.",
  "Puls in intervals.icu korrigieren": "Correct heart rate in intervals.icu",
  "Überschreibt in intervals.icu den Puls der":
    "Overwrites, in intervals.icu, the heart rate of the",
  "gestörten Minuten mit der Schätzung; der Rest der Aufzeichnung, Leistung und Tempo bleiben, wie sie sind.":
    "disturbed minutes with the estimate; the rest of the recording, power and pace stay as they are.",
  "In der App lässt sich das nicht rückgängig machen.": "This cannot be undone in the app.",
  "Überschreiben": "Overwrite",
  "In intervals.icu korrigieren": "Correct in intervals.icu",
  "geplant und absolviert": "planned and done",
  "anders trainiert als geplant": "trained differently than planned",
  "geplant, nicht absolviert": "planned, not done",
  "heute, noch offen": "today, still open",
  "spontan trainiert": "trained spontaneously",
  "geplant: {0}": "planned: {0}",
  "nichts geplant": "nothing planned",
  "~{0} TSS, aus Tempo geschätzt": "~{0} TSS, estimated from speed",
  "kein Training": "no training",
  "Letzte 7 Tage": "Last 7 days",
  "Legende": "Legend",
  "Zahl: Belastung (TSS), ~ geschätzt": "Number: load (TSS), ~ estimated",
  "Zuletzt geplant:": "Last planned:",
  "am": "on",
  "absolviert": "done",
  "({0} % Übereinstimmung)": "({0} % compliance)",
  "stattdessen": "instead",
  "nicht absolviert": "not done",
  "Sprache": "Language",
  "{0} · oberste Stufe": "{0} · top level",
  "{0} · selbst gewählt, erreicht ist Stufe {1}": "{0} · chosen by you, level {1} is reached",
  "Stufen": "Levels",
  "gesteigert": "raised",
  "Stufe {0} von {1} angeboten": "Level {0} of {1} offered",
  "Stufe für {0} wählen": "Choose level for {0}",
  "Stufe folgt den gelaufenen und gefahrenen Intervallen":
    "Level follows the intervals run and ridden",
  "Auto": "Auto",
  "Stufe": "Level",
  "speichert…": "saving…",
  "Die nächste Stufe wird frei, sobald du in einer Einheit jedes Intervall voll und mindestens im Zielbereich fährst. Zu hart gefahren hebt die Schwelle, nicht die Stufe. Auf der obersten steigern sich die Einheiten über die Schwellenwerte. Du kannst die Stufe auch selbst wählen — nach oben wie nach unten; mit „Auto“ entscheiden wieder die Intervalle.":
    "The next level opens as soon as you ride every interval of a session in full and at least in the target range. Riding too hard raises the threshold, not the level. On the top level the sessions grow through the thresholds. You can also choose the level yourself — up as well as down; with “Auto” the intervals decide again.",
  "(heute)": "(today)",
  "(gestern)": "(yesterday)",
  "(vor {0} Tagen)": "({0} days ago)",
  "Kennzahlen": "Metrics",
  "Rampe / Woche": "Ramp / week",
  "Load 7 Tage": "Load 7 days",
  "Hart diese Woche": "Hard this week",
  "letzte harte": "last hard",
  "vor {0} T.": "{0} d ago",
  "Zuletzt gesehen:": "Last seen:",
  "mit Belastung von": "with load out of",
  "Einträgen (180 Tage)": "entries (180 days)",
  "Keine Einheiten in den letzten 180 Tagen gefunden.": "No sessions found in the last 180 days.",
  "Zeit": "Time",
  "wie immer": "as usual",
  "Kern ab": "Core from",
  "Saison": "Season",
  "{0} Wochen bis zum Ziel": "{0} weeks to the goal",
  "{0} Wochen voraus": "{0} weeks ahead",
  "Phasen der kommenden Wochen": "Phases of the coming weeks",
  "Woche ab {0} — {1}{2}": "Week from {0} — {1}{2}",
  ", Zielwoche": ", goal week",
  "aktuelle Woche": "current week",
  "Zielwoche ab": "Goal week from",
  "bis": "to",
  "Route noch offen": "Route still open",
  "Runde": "lap",
  "Runden": "laps",
  "grobe Schätzung": "rough estimate",
  "geschätzt aus {0} Rennen": "estimated from {0} races",
  "★ empfohlen": "★ recommended",
  "Dauer wählen": "Choose duration",
  "Schritte im Detail": "Steps in detail",
  "Warum diese Einheit": "Why this session",
  ". Intervalle und Zielwerte bleiben unverändert — die zusätzliche Zeit ist lockere Grundlage, kein zweiter Reiz.":
    ". Intervals and targets stay unchanged — the extra time is easy endurance, not a second stimulus.",
  ". Intervalllänge und Zielwerte bleiben unverändert — nur das Volumen sinkt. Fehlen dabei Intervalle, zählt sie nicht für die nächste Stufe.":
    ". Interval length and targets stay unchanged — only the volume drops. If intervals are missing in it, it does not count towards the next level.",
  "✓ Diese Fassung ist im Kalender": "✓ This version is in the calendar",
  "→ Kalender + {0}": "→ Calendar + {0}",
  "→ Kalender": "→ Calendar",
  "Wird an den Kalender gesendet…": "Sending to the calendar…",
  "Diese Fassung ist jetzt im Kalender.": "This version is now in the calendar.",
  "Min. — schaffe ich immer": "Min — I always manage",
  "Min. — normalerweise": "Min — normally",
  "Min. — wenn viel Zeit ist": "Min — when there is plenty of time",
  "Einstellungen": "Settings",
  "Schließen": "Close",
  "Sportarten": "Sports",
  "Einheiten / Woche (mindestens)": "Sessions / week (at least)",
  "Einheiten / Woche (höchstens)": "Sessions / week (at most)",
  "Planstart": "Plan start",
  "Kein konkretes Ziel – fit bleiben.": "No specific goal – stay fit.",
  "Wettkampfziel hinzufügen": "Add race goal",
  "FTP-Ziel hinzufügen": "Add FTP goal",
  "Speichern": "Save",
  "Schwellen von intervals.icu holen": "Fetch thresholds from intervals.icu",
  "Schwellenpace": "Threshold pace",
  "min/100 m": "min/100 m",
  "FTP in Watt, z. B. 250": "FTP in watts, e.g. 250",
  "Pace als m:ss pro km, z. B. 4:30": "Pace as m:ss per km, e.g. 4:30",
  "CSS als m:ss pro 100 m, z. B. 1:50": "CSS as m:ss per 100 m, e.g. 1:50",
  "Lädt…": "Loading…",
  "Aktualisieren": "Refresh",
  "Noch offen": "Still open",
  "bisher nicht": "not yet",
  "seit {0} Tagen": "for {0} days",
  "Lange Einheit steht.": "Long session is done.",
  "Strava ist verbunden.": "Strava is connected.",
  "Auf Strava abgebrochen — nichts verbunden.": "Cancelled on Strava — nothing connected.",
  "Ohne das Recht, Aktivitäten zu bearbeiten, kann die App auf Strava nichts ergänzen. Beim Verbinden bitte alle Häkchen gesetzt lassen.":
    "Without the right to edit activities the app cannot add anything on Strava. Please leave all boxes ticked when connecting.",
  "Die Verbindung mit Strava ist fehlgeschlagen. Bitte noch einmal versuchen.":
    "Connecting to Strava failed. Please try again.",
  "Trennen fehlgeschlagen": "Disconnecting failed",
  "Strava": "Strava",
  "Verbunden als": "Connected as",
  ". Nach jeder erkannten Einheit steht der Soll-Ist-Vergleich in ihrer Beschreibung auf Strava; dein eigener Text bleibt stehen. Hochladen tut weiter dein Gerät.":
    ". After every recognised session the planned vs. actual comparison is in its description on Strava; your own text stays. Uploading is still done by your device.",
  "Strava trennen": "Disconnect Strava",
  "Schreibt nach jeder erkannten Einheit den Soll-Ist-Vergleich in die Beschreibung der Aktivität auf Strava. Bilder nimmt Strava von anderen Apps nicht an — dafür gibt es unter jeder Einheit „Bild teilen“.":
    "After every recognised session, writes the planned vs. actual comparison into the description of the activity on Strava. Strava does not accept images from other apps — for that there is “Share image” under every session.",
  "Connect with Strava": "Connect with Strava",
  "Compatible with Strava": "Compatible with Strava",
  "Einstieg": "Introduction",
  "Volles Programm": "Full programme",
  "Erhalt": "Maintenance",
  "Kraft": "Strength",
  "Erledigt — zählt für die Progression": "Done — counts towards progression",
  "(Erklärung)": "(explanation)",
  "Darstellung": "Appearance",
  "Einplanen fehlgeschlagen": "Scheduling failed",
  "Übernehmen fehlgeschlagen": "Adopting failed",
  "Deine Schwellenwerte stimmen nicht mehr": "Your thresholds are no longer right",
  "Sämtliche Watt- und Pace-Vorgaben werden aus diesen Werten berechnet — und intervals.icu rechnet Belastung und Übereinstimmung mit seinen eigenen. Übernehmen setzt beide Seiten auf denselben Wert.":
    "All watt and pace targets are calculated from these values — and intervals.icu calculates load and compliance with its own. Adopting sets both sides to the same value.",
  "✓ Im Kalender": "✓ In the calendar",
  "{0} einplanen": "Schedule {0}",
  "Übernimmt…": "Adopting…",
  "Übernehmen und synchronisieren": "Adopt and sync",
  "Trotzdem übernehmen": "Adopt anyway",
  "Wochenlast": "Weekly load",
  "Wochenlast der letzten {0} Wochen, Höchstwert {1} TSS, Durchschnitt {2} TSS":
    "Weekly load of the last {0} weeks, peak {1} TSS, average {2} TSS",
  "{0} — {1} TSS aus {2} Einheiten{3}": "{0} — {1} TSS from {2} sessions{3}",
  "(Woche läuft noch)": "(week still running)",
  "höchste Woche": "highest week",
  "laufende Woche, noch nicht vorbei": "current week, not over yet",
  "KW": "Wk",
  ", reduziert": ", reduced",
  "noch heute": "today left",
  "noch {0} Tage": "{0} days left",
  "{0} von {1} harten Einheiten": "{0} of {1} hard sessions",
  "{0} von {1} Einheiten{2}": "{0} of {1} sessions{2}",
  ", bis {0}": ", up to {0}",
  "− Nur die nächsten drei Tage": "− Only the next three days",
  "+ Ganze Woche zeigen": "+ Show the whole week",
  "Profil über {0} Minuten, {1} Abschnitte,": "Profile over {0} minutes, {1} segments,",
  "{0}, Spitze bei {1} Prozent der Schwelle.": "{0}, peak at {1} percent of threshold.",
  "keiner davon hart": "none of them hard",
  "{0} davon hart": "{0} of them hard",
  "Routenliste nicht erreichbar — Routen lassen sich gerade nicht eintragen.":
    "Route list unreachable — routes cannot be entered right now.",
  "Zwift Racing League": "Zwift Racing League",
  "ZRL-Termine im Trainingsplan berücksichtigen":
    "Take ZRL dates into account in the training plan",
  "Taper: Tag vor dem Rennen locker mit kurzen Antritten":
    "Taper: the day before the race easy with short efforts",
  "Eingeschaltet wird jeder Dienstag ein Renntag — ein Qualitätstag, die Alternative steht immer daneben, ob du fährst, entscheidest du am Tag selbst. Ohne Eintrag ist die Schätzung grob; Format und Route stehen bei WTRL oder Zwift Insider. Zwischen zwei Runden ausschalten.":
    "When switched on, every Tuesday becomes a race day — a quality day, the alternative always stands next to it, and whether you race you decide on the day. Without an entry the estimate is rough; format and route are listed at WTRL or Zwift Insider. Switch off between two rounds.",
  "Erstes Rennen": "First race",
  "Wochen": "weeks",
  "Termine anlegen": "Create dates",
  "Format": "Format",
  "wählen…": "choose…",
  "Route": "Route",
  "noch offen": "still open",
  "Rennen entfernen": "Remove race",
  "✓ Gespeichert": "✓ Saved",
  "Runde speichern": "Save round",
  "Keine Verbindung. Prüf dein Netz und versuch es noch einmal.":
    "No connection. Check your network and try again.",
  "intervals.icu oder Strava antwortet gerade nicht. Bitte versuch es gleich noch einmal.":
    "intervals.icu or Strava is not answering right now. Please try again in a moment.",
  "Da ist bei uns etwas schiefgelaufen. Bitte versuch es gleich noch einmal.":
    "Something went wrong on our side. Please try again in a moment.",
  "Du bist nicht mehr angemeldet. Bitte melde dich neu an.":
    "You are no longer signed in. Please sign in again.",
  "Gerade zu viele Anfragen. Bitte versuch es in ein paar Minuten noch einmal.":
    "Too many requests just now. Please try again in a few minutes.",
  "Zeit als mm:ss oder h:mm:ss, z. B. 38:30 oder 1:45:00":
    "Time as mm:ss or h:mm:ss, e.g. 38:30 or 1:45:00",
  "Bitte eine Zeit eintragen": "Please enter a time",
  "Fitness (CTL)": "Fitness (CTL)",
  "Deine durchschnittliche Trainingsbelastung der letzten etwa sechs Wochen.":
    "Your average training load of roughly the last six weeks.",
  "Steigt sie langsam, wirst du belastbarer.": "If it rises slowly, you can take more load.",
  "Ermüdung (ATL)": "Fatigue (ATL)",
  "Deine durchschnittliche Belastung der letzten etwa sieben Tage.":
    "Your average load of roughly the last seven days.",
  "Sie zeigt, wie viel frisches Training noch in den Beinen steckt.":
    "It shows how much fresh training is still in your legs.",
  "Form (TSB)": "Form (TSB)",
  "Fitness minus Ermüdung.": "Fitness minus fatigue.",
  "Im Plus bist du frisch, tief im Minus steigt das Risiko für Überlastung.":
    "In the plus you are fresh, deep in the minus the risk of overload rises.",
  "Rampe": "Ramp",
  "Wie stark deine Fitness in der letzten Woche gestiegen ist.":
    "How much your fitness rose in the last week.",
  "Mehr als etwa +6 pro Woche ist ein Warnsignal für Verletzungen.":
    "More than about +6 per week is a warning sign for injuries.",
  "TSS / Load": "TSS / load",
  "Die Belastung einer Einheit aus Dauer und Intensität; eine Stunde an der Schwelle sind etwa 100.":
    "The load of a session from duration and intensity; one hour at threshold is about 100.",
  "Daraus rechnet der Plan Fitness, Ermüdung und Form.":
    "From it the plan calculates fitness, fatigue and form.",
  "Die Leistung in Watt, die du etwa eine Stunde lang halten kannst.":
    "The power in watts you can hold for about an hour.",
  "Alle Wattvorgaben auf dem Rad sind Prozent davon.":
    "All watt targets on the bike are percentages of it.",
  "Das Lauftempo, das du etwa eine Stunde lang halten kannst.":
    "The running pace you can hold for about an hour.",
  "Alle Pace-Vorgaben beim Laufen richten sich danach.":
    "All pace targets in running are based on it.",
  "Critical Swim Speed: dein Schwellentempo im Wasser pro 100 m.":
    "Critical Swim Speed: your threshold pace in the water per 100 m.",
  "Alle Vorgaben beim Schwimmen richten sich danach.": "All targets in swimming are based on it.",
  "Die Schwankung zwischen deinen Herzschlägen, morgens in Ruhe gemessen.":
    "The variation between your heartbeats, measured at rest in the morning.",
  "Liegt sie deutlich unter deinem Normalwert, bist du noch nicht erholt.":
    "If it is clearly below your normal value, you are not recovered yet.",
  "Bitte ein gültiges Datum wählen": "Please choose a valid date",
  "Das Datum liegt in der Vergangenheit": "The date is in the past",
  "Ein FTP-Ziel braucht Rad mit FTP bei den Sportarten":
    "An FTP goal needs the bike with an FTP among the sports",
  "FTP-Ziel in Watt, z. B. 300": "FTP goal in watts, e.g. 300",
  "Bitte die Distanz in {0} eintragen": "Please enter the distance in {0}",
  "{0} {1} in {2}": "{0} {1} in {2}",
  "Geplant und ausgewertet mit Etmal · etmal.coach":
    "Planned and analysed with Etmal · etmal.coach",
  "IM ZIEL": "ON TARGET",
  "Dieser Browser kann kein Bild zeichnen": "This browser cannot draw an image",
  "Bild konnte nicht erzeugt werden": "The image could not be created",
  "Hell": "Light",
  "Dunkel": "Dark",
  "aus intervals.icu übernommen": "taken from intervals.icu",
  "Schätzwert – bitte prüfen": "estimate – please check",
  "⚑ Rennen": "⚑ race",
  "↔ anders": "↔ different",
  "✕ nicht absolviert": "✕ not done",
  "+ spontan": "+ spontaneous",
  "{0}: Format fehlt": "{0}: format missing",
  "{0}: Route „{1}\" nicht gefunden": "{0}: route “{1}\" not found",
  "Der Demo-Betrieb läuft ohne Zugang zu echten Konten. Bitte entfernen: {0}.":
    "The demo runs without access to real accounts. Please remove: {0}.",
  "Nicht konfiguriert: DEMO_PASSWORD fehlt.": "Not configured: DEMO_PASSWORD is missing.",
  "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.":
    "Too many failed attempts. Please try again in 15 minutes.",
  "Passwort falsch": "Wrong password",
  "Nicht angemeldet": "Not signed in",
  "Zu viele Anfragen auf einmal. Bitte eine Minute warten.":
    "Too many requests at once. Please wait a minute.",
  "Demo-Sitzung fehlt": "Demo session missing",
  "In der Demo nicht verfügbar": "Not available in the demo",
  "Anmeldung ist nicht konfiguriert": "Sign-in is not configured",
  "Die Anmeldung läuft über intervals.icu": "Sign-in runs through intervals.icu",
  "Nicht konfiguriert": "Not configured",
  "Die Warteliste ist noch nicht eingerichtet.": "The waitlist is not set up yet.",
  "Das sieht nicht nach einer E-Mail-Adresse aus.": "That does not look like an email address.",
  "Zu viele Versuche. Bitte in einer Stunde erneut.":
    "Too many attempts. Please try again in an hour.",
  "Das Eintragen hat gerade nicht geklappt. Bitte versuch es später noch einmal.":
    "Signing up did not work just now. Please try again later.",
  "Nicht konfiguriert. Entweder INTERVALS_CLIENT_ID, INTERVALS_CLIENT_SECRET und SESSION_SECRET":
    "Not configured. Either set INTERVALS_CLIENT_ID, INTERVALS_CLIENT_SECRET and SESSION_SECRET",
  "für den Mehrbenutzer-Betrieb setzen, oder INTERVALS_API_KEY, INTERVALS_ATHLETE_ID und APP_PASSWORD":
    "for multi-user mode, or INTERVALS_API_KEY, INTERVALS_ATHLETE_ID and APP_PASSWORD",
  "für den Einzelbetrieb.": "for single-user mode.",
  "Nur im Mehrbenutzer-Betrieb": "Multi-user mode only",
  "Token-Austausch fehlgeschlagen ({0})": "Token exchange failed ({0})",
  "Antwort enthielt kein access_token": "The answer contained no access_token",
  "Athletenprofil nicht lesbar ({0})": "Athlete profile not readable ({0})",
  "Athletenprofil ohne id": "Athlete profile without id",
  "Strava ist nicht eingerichtet": "Strava is not set up",
  "templateId und date (YYYY-MM-DD) fehlen": "templateId and date (YYYY-MM-DD) are missing",
  "Strava ist nicht verbunden": "Strava is not connected",
  "Strava hat abgelehnt ({0})": "Strava refused ({0})",
  "Strava-Anmeldung fehlgeschlagen ({0})": "Strava sign-in failed ({0})",
  "Strava hat kein vollständiges Token geschickt": "Strava sent no complete token",
  "Strava hat kein Athletenprofil geschickt": "Strava sent no athlete profile",
  "noch 1 Tag": "1 day left",
  "vor 1 Tag": "1 day ago",
  "vor {0} Tagen": "{0} days ago",
  "Pause nach harter Einheit — für die fehlende 1 Einheit bleiben noch {0} Tage":
    "Rest after a hard session — {0} days remain for the 1 session still missing",
  "Pause nach harter Einheit — für die fehlenden {0} Einheiten bleiben noch {1} Tage":
    "Rest after a hard session — {1} days remain for the {0} sessions still missing",
  "letzte {0} Tage": "last {0} days",
  "Alle {0} Wochen dieselbe Einheit. Verglichen wird Tempo bzw. Leistung pro Herzschlag in den Arbeitsintervallen — mehr Arbeit für denselben Puls ist der Fortschritt.":
    "The same session every {0} weeks. What is compared is pace or power per heartbeat in the work intervals — more work for the same heart rate is the progress.",
  "noch 1 Tag · bis": "1 day left · until",
  "noch {0} Tage · bis": "{0} days left · until",
  "Alle {0} Einheiten der letzten 180 Tage kommen ohne Trainingsbelastung an. intervals.icu berechnet diese nur, wenn eine Einheit Herzfrequenz- oder Leistungsdaten enthält. Ohne sie kann der Plan Fitness und Ermüdung nicht bestimmen.":
    "All {0} sessions of the last 180 days arrive without training load. intervals.icu only calculates it when a session contains heart-rate or power data. Without it the plan cannot determine fitness and fatigue.",
  "Nicht {0}: Intervall {1}.": "Not {0}: interval {1}.",
  "noch 1 Woche · bis {0}": "1 week left · until {0}",
  "noch {0} Wochen · bis {1}": "{0} weeks left · until {1}",
  "gefahren": "ridden",
  "gelaufen": "run",
  "geschwommen": "swum",
  "{0} eingetragen, {1} — heute nichts. {2}": "{0} entered, {1} — nothing today. {2}",
  "{0} eingetragen, {1} — höchstens locker, freiwillig. {2}": "{0} entered, {1} — easy at most, optional. {2}",
  "Ruhetag": "Rest day",
  "Sende…": "Sending…",
  "realistisch": "realistic",
  "ambitioniert": "ambitious",
}
