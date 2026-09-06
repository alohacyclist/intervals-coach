import { useState } from 'react'

const STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Anmelden',
    body: 'Ein Klick über intervals.icu. Kein neues Passwort, keine API-Schlüssel zum Kopieren.',
  },
  {
    title: 'Ziel festlegen',
    body: 'FTP-Wert, Wettkampfzeit oder beides — mit Zieldatum oder offen. Dazu, wie oft du realistisch trainierst.',
  },
  {
    title: 'Loslegen',
    body: 'Jeden Morgen stehen die nächsten drei Tage bereit. Passende Einheit auswählen, per Klick in deinen Kalender.',
  },
]

export const Landing = ({ error }: { readonly error: string | null }) => {
  const [consented, setConsented] = useState(false)

  return (
    <div className="landing">
      <header className="landing__hero">
        <p className="landing__eyebrow">Intervals Coach</p>
        <h1>Dein Trainingsplan für die nächsten drei Tage — aus deinen eigenen Daten.</h1>
        <p className="landing__lead">
          Der Coach liest deine Einheiten und Erholungswerte aus intervals.icu und schlägt für
          jeden Tag <em>jede</em> deiner Sportarten als gleichwertige Alternative vor — jeweils
          komplett und als Kurzfassung. Du nimmst die, für die du gerade Zeit und Lust hast.
        </p>

        {error && (
          <p className="error error--block">
            {error === 'abgelehnt'
              ? 'Zugriff wurde abgelehnt. Ohne Freigabe kann der Plan deine Daten nicht lesen.'
              : error === 'einwilligung'
                ? 'Ohne Einwilligung in die Verarbeitung deiner Gesundheitsdaten ist keine Anmeldung möglich.'
                : 'Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.'}
          </p>
        )}

        <label className="consent">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
          />
          <span>
            Ich willige ein, dass meine Trainings- und Gesundheitsdaten aus intervals.icu —
            Herzfrequenz, Herzratenvariabilität, Ruhepuls und Schlaf — zur Berechnung meines
            Trainingsplans verarbeitet werden (Art. 9 Abs. 2 lit. a DSGVO). Widerruf jederzeit
            möglich. Näheres in der <a href="/datenschutz">Datenschutzerklärung</a>.
          </span>
        </label>

        <a
          className={consented ? 'cta' : 'cta cta--locked'}
          href="/auth/login?einwilligung=ja"
          aria-disabled={!consented}
          onClick={(event) => {
            if (!consented) event.preventDefault()
          }}
        >
          Mit intervals.icu anmelden
        </a>
        <p className="landing__hint">Kostenlos. Du brauchst ein intervals.icu-Konto.</p>
      </header>

      <section className="landing__section">
        <h2>Warum zwei Vorschläge pro Tag?</h2>
        <p>
          Weil Zeit der eigentliche Engpass ist. Mal passt die Rolle, mal sind die Laufschuhe
          schneller angezogen. Beide Vorschläge setzen am selben Tag denselben Trainingsreiz —
          welchen Sport du wählst, ändert den Plan nicht, nur den Weg dahin.
        </p>
      </section>

      <section className="landing__section">
        <h2>So läuft es</h2>
        <ol className="landing__steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing__section">
        <h2>Was der Plan berücksichtigt</h2>
        <ul className="landing__list">
          <li>Fitness, Ermüdung und Form — getrennt für Rad und Lauf</li>
          <li>
            HRV, Ruhepuls und Schlaf im Vergleich zu deiner eigenen Baseline der letzten 30 Tage
          </li>
          <li>Mindestens 48 Stunden zwischen zwei harten Einheiten</li>
          <li>Periodisierung auf dein Zieldatum, mit reduzierter Woche in jedem vierten Block</li>
          <li>Dein Zeitbudget: keine 90-Minuten-Einheit, wenn du 45 Minuten hast</li>
        </ul>
      </section>

      <section className="landing__section landing__section--muted">
        <h2>Deine Daten</h2>
        <p>
          Die Anmeldung läuft über intervals.icu. Der Coach fragt genau drei Berechtigungen an:
          Aktivitäten lesen, Erholungswerte lesen, geplante Einheiten in deinen Kalender schreiben.
          Kein Zugriff auf dein Passwort, keine Möglichkeit, etwas zu löschen. Du kannst die
          Freigabe jederzeit in deinen intervals.icu-Einstellungen widerrufen.
        </p>
        <p className="landing__legal">
          <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>
        </p>
      </section>
    </div>
  )
}
