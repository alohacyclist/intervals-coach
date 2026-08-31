/**
 * Placeholder legal pages. intervals.icu requires a privacy policy URL for the
 * OAuth registration, and a German site needs an imprint — both need real
 * content from the operator before going public.
 */
const OPERATOR = '[Name, Anschrift, E-Mail eintragen]'

export const Privacy = () => (
  <article className="legal">
    <h1>Datenschutzerklärung</h1>
    <p className="legal__todo">
      Entwurf. Vor der Veröffentlichung durch den Betreiber zu prüfen und zu vervollständigen.
    </p>

    <h2>Verantwortlicher</h2>
    <p>{OPERATOR}</p>

    <h2>Welche Daten verarbeitet werden</h2>
    <ul>
      <li>
        <strong>Trainings- und Gesundheitsdaten aus intervals.icu:</strong> Aktivitäten der letzten
        180 Tage (Dauer, Trainingsbelastung, Intensität, Sportart) sowie Erholungswerte der letzten
        60 Tage (Herzratenvariabilität, Ruhepuls, Schlafdauer, subjektives Befinden). Diese Daten
        werden bei jedem Aufruf frisch abgerufen und <em>nicht</em> dauerhaft gespeichert.
      </li>
      <li>
        <strong>Zugangs-Token:</strong> Die von intervals.icu ausgestellten OAuth-Token werden
        verschlüsselt gespeichert, um wiederholte Anmeldungen zu vermeiden.
      </li>
      <li>
        <strong>Deine Zielkonfiguration:</strong> Zielwerte, Zieldaten, Trainingsumfang und
        Leistungswerte, die du selbst eingibst.
      </li>
    </ul>

    <h2>Rechtsgrundlage</h2>
    <p>
      Herzratenvariabilität, Ruhepuls und Schlafdaten sind Gesundheitsdaten im Sinne von Art. 9
      DSGVO. Die Verarbeitung erfolgt ausschließlich auf Grundlage deiner ausdrücklichen
      Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO, die du mit der Freigabe in intervals.icu
      erteilst und jederzeit widerrufen kannst.
    </p>

    <h2>Weitergabe</h2>
    <p>
      Keine Weitergabe an Dritte. Die Anwendung läuft auf Cloudflare Workers; Cloudflare ist
      Auftragsverarbeiter.
    </p>

    <h2>Löschung und Widerruf</h2>
    <p>
      Du kannst den Zugriff jederzeit in deinen intervals.icu-Einstellungen entziehen. Auf Anfrage
      an den oben genannten Verantwortlichen werden gespeicherte Token und Zielkonfiguration
      vollständig gelöscht.
    </p>

    <p className="legal__back">
      <a href="/">Zurück</a>
    </p>
  </article>
)

export const Imprint = () => (
  <article className="legal">
    <h1>Impressum</h1>
    <p className="legal__todo">
      Entwurf. Angaben nach § 5 DDG vom Betreiber zu ergänzen.
    </p>
    <h2>Angaben gemäß § 5 DDG</h2>
    <p>{OPERATOR}</p>
    <h2>Kontakt</h2>
    <p>[E-Mail-Adresse eintragen]</p>
    <h2>Haftungsausschluss</h2>
    <p>
      Die Trainingsvorschläge sind automatisch erzeugt und ersetzen keine sportmedizinische oder
      trainingswissenschaftliche Beratung. Die Nutzung erfolgt auf eigene Verantwortung.
    </p>
    <p className="legal__back">
      <a href="/">Zurück</a>
    </p>
  </article>
)
