import { OPERATOR, PROCESSOR, RETENTION_MONTHS, SUPERVISOR } from './operator.ts'

export const Privacy = () => (
  <article className="legal">
    <h1>Datenschutzerklärung</h1>

    <p>
      Intervals Coach verarbeitet Gesundheitsdaten. Diese Erklärung sagt in einfacher Sprache, was
      damit passiert, warum, wie lange und wie du es wieder rückgängig machst.
    </p>

    <h2>Verantwortlicher</h2>
    <p>
      {OPERATOR.name}
      <br />
      {OPERATOR.street}
      <br />
      {OPERATOR.city}
      <br />
      E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
    </p>
    <p>
      Ein Datenschutzbeauftragter ist nicht bestellt; die gesetzlichen Voraussetzungen dafür liegen
      nicht vor.
    </p>

    <h2>Welche Daten verarbeitet werden</h2>
    <ul>
      <li>
        <strong>Trainings- und Gesundheitsdaten aus deinem intervals.icu-Konto:</strong> Aktivitäten
        der letzten 180 Tage (Datum, Sportart, Dauer, Trainingsbelastung, Intensität, Herzfrequenz,
        Zeit in den Trainingszonen) und Erholungswerte der letzten 60 Tage
        (Herzratenvariabilität, Ruhepuls, Schlafdauer, subjektives Befinden). Diese Daten werden bei
        jedem Seitenaufruf frisch von intervals.icu abgerufen, im Arbeitsspeicher ausgewertet und{' '}
        <strong>nicht gespeichert</strong>.
      </li>
      <li>
        <strong>Zugangs-Token:</strong> Die von intervals.icu ausgestellten OAuth-Token, damit du
        dich nicht bei jedem Aufruf neu anmelden musst. Sie werden verschlüsselt gespeichert
        (AES-GCM).
      </li>
      <li>
        <strong>Deine Konfiguration:</strong> Ziele, Zieldaten, Leistungswerte, gewählte Sportarten,
        Trainingsumfang, Ausrüstung und absolvierte Krafteinheiten — also das, was du selbst
        einträgst.
      </li>
      <li>
        <strong>Anmeldename und Athleten-ID</strong> aus intervals.icu sowie der Zeitpunkt deiner
        Einwilligung und deines letzten Besuchs.
      </li>
      <li>
        <strong>Sitzungs-Cookie:</strong> ein signiertes Cookie (<code>HttpOnly</code>,{' '}
        <code>Secure</code>, <code>SameSite=Lax</code>, 30 Tage Laufzeit), das nur deine
        Athleten-ID enthält, plus ein kurzlebiges Cookie während der Anmeldung zum Schutz gegen
        CSRF. Beide sind für den Betrieb erforderlich; eine Einwilligung nach § 25 TDDDG ist dafür
        nicht nötig.
      </li>
      <li>
        <strong>Server-Protokolle:</strong> Beim Abruf fallen bei unserem Hoster technische Daten an
        (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browserkennung). Sie dienen dem sicheren
        Betrieb und werden nicht mit deinem Konto zusammengeführt.
      </li>
      <li>
        <strong>Im Browser gespeichert:</strong> deine Wahl zwischen heller und dunkler Darstellung.
        Sie verlässt dein Gerät nicht.
      </li>
    </ul>
    <p>
      Es findet <strong>kein Tracking</strong> statt: keine Analysewerkzeuge, keine Werbenetzwerke,
      keine Drittanbieter-Cookies. Auch die Schriftarten werden mit der Seite ausgeliefert und nicht
      von einem fremden Server nachgeladen.
    </p>

    <h2>Rechtsgrundlage</h2>
    <ul>
      <li>
        Herzratenvariabilität, Ruhepuls, Schlaf und Herzfrequenz sind <strong>Gesundheitsdaten</strong>{' '}
        nach Art. 9 Abs. 1 DSGVO. Ihre Verarbeitung erfolgt ausschließlich auf Grundlage deiner
        ausdrücklichen Einwilligung nach <strong>Art. 9 Abs. 2 lit. a DSGVO</strong>, die du vor der
        Anmeldung erteilst.
      </li>
      <li>
        Token, Konfiguration und Sitzung werden auf Grundlage von <strong>Art. 6 Abs. 1 lit. b
        DSGVO</strong> verarbeitet — ohne sie ist die angefragte Leistung nicht erbringbar.
      </li>
      <li>
        Server-Protokolle beruhen auf dem berechtigten Interesse an einem sicheren und stabilen
        Betrieb, <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>.
      </li>
    </ul>

    <h2>Woher die Daten kommen und wohin sie gehen</h2>
    <p>
      Quelle ist ausschließlich dein eigenes intervals.icu-Konto, dessen Freigabe du im
      OAuth-Dialog erteilst. In dieselbe Richtung zurück schreibt die App nur, wenn du es auslöst:
      geplante Einheiten in deinen intervals.icu-Kalender und, wenn du einen Schwellenwert
      übernimmst, den neuen Wert in deine dortigen Sport-Einstellungen. Für dein Verhältnis zu
      intervals.icu gilt deren eigene Datenschutzerklärung.
    </p>

    <h2>Empfänger</h2>
    <p>
      Eine Weitergabe an Dritte zu eigenen Zwecken findet nicht statt. Die Anwendung läuft bei{' '}
      {PROCESSOR.name}, {PROCESSOR.address}, als Auftragsverarbeiter nach Art. 28 DSGVO. Dabei können
      Daten in die USA übermittelt werden. Grundlage sind die Standardvertragsklauseln der
      EU-Kommission sowie die Zertifizierung des Anbieters unter dem EU-US Data Privacy Framework.
    </p>

    <h2>Speicherdauer</h2>
    <p>
      Token, Konfiguration und Kontodaten werden gelöscht, sobald du dein Konto löschst oder deine
      Einwilligung widerrufst — spätestens jedoch <strong>{RETENTION_MONTHS} Monate</strong> nach
      deinem letzten Besuch. Die Löschung nach Fristablauf erfolgt automatisch. Trainings- und
      Gesundheitsdaten werden ohnehin nicht gespeichert, sondern bei jedem Aufruf neu abgerufen.
    </p>

    <h2>Deine Rechte</h2>
    <p>
      Dir stehen gegenüber dem Verantwortlichen die folgenden Rechte zu: Auskunft (Art. 15),
      Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
      Datenübertragbarkeit (Art. 20) und Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine
      formlose E-Mail an die oben genannte Adresse genügt.
    </p>
    <p>
      <strong>Widerruf der Einwilligung:</strong> Du kannst deine Einwilligung jederzeit mit Wirkung
      für die Zukunft widerrufen, ohne dass die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung
      berührt wird. Am schnellsten geht das über „Konto und Daten löschen“ in den Einstellungen der
      App; zusätzlich kannst du den Zugriff jederzeit in deinen intervals.icu-Einstellungen
      entziehen.
    </p>

    <h2>Beschwerderecht</h2>
    <p>
      Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig ist:
      <br />
      {SUPERVISOR.name}
      <br />
      {SUPERVISOR.street}
      <br />
      {SUPERVISOR.city}
      <br />
      <a href={SUPERVISOR.url} rel="noreferrer">
        {SUPERVISOR.url}
      </a>
    </p>

    <h2>Automatisierte Entscheidungen</h2>
    <p>
      Die Trainingsvorschläge entstehen automatisiert. Sie entfalten dir gegenüber keine rechtliche
      Wirkung und beeinträchtigen dich nicht in ähnlicher Weise erheblich; eine automatisierte
      Entscheidung im Sinne von Art. 22 DSGVO liegt damit nicht vor. Ob du einem Vorschlag folgst,
      entscheidest allein du.
    </p>

    <h2>Pflicht zur Bereitstellung</h2>
    <p>
      Die Bereitstellung der Daten ist weder gesetzlich noch vertraglich vorgeschrieben. Ohne
      Freigabe deiner intervals.icu-Daten kann die App allerdings keinen Plan berechnen — das ist
      ihr einziger Zweck.
    </p>

    <p className="legal__back">
      <a href="/">Zurück</a>
    </p>
  </article>
)
