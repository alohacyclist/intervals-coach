import { useState } from 'react'
import { joinWaitlist } from './api.ts'

/**
 * The page a shared picture leads to. It says what the app does in the first
 * sentence, shows it, and asks for one thing: sign in once intervals.icu has
 * opened the app to everyone, or leave an address until then.
 */

type Mode = 'waitlist' | 'signup'

type Props = {
  /** Before the app is open to everyone, a waitlist stands where the sign-in will be. */
  readonly mode: Mode
  readonly error: string | null
  /** Back from the confirmation link in Brevo's mail. */
  readonly confirmed?: boolean
}

/** A made-up morning, so the page shows the product before asking for anything. */
const EXAMPLE: readonly { readonly sport: string; readonly css: string; readonly name: string; readonly minutes: number }[] = [
  { sport: 'Rad', css: 'ride', name: 'Sweetspot 3 × 12′', minutes: 60 },
  { sport: 'Laufen', css: 'run', name: 'Schwelle 4 × 6′', minutes: 45 },
  { sport: 'Rad', css: 'ride', name: 'Sweetspot 2 × 10′ · Kurzfassung', minutes: 30 },
]

const ExampleDay = () => (
  <figure className="example" aria-label="Beispiel: so sieht ein Tag in Formkurve aus">
    <figcaption className="example__head">
      <span>Heute · Beispiel</span>
      <span className="badge badge--key">Qualitätstag</span>
    </figcaption>
    <p className="example__reason">Du bist erholt – heute darf es hart sein.</p>
    <ul className="example__options">
      {EXAMPLE.map((option, index) => (
        <li key={option.name}>
          {index > 0 && <span className="example__or">oder</span>}
          <strong className="readout">{option.minutes}′</strong>
          <span className={`badge badge--${option.css}`}>{option.sport}</span>
          <span>{option.name}</span>
        </li>
      ))}
    </ul>
    <p className="example__note">Derselbe Reiz, egal welche du nimmst.</p>
  </figure>
)

const SHOTS: readonly { readonly src: string; readonly alt: string; readonly caption: string }[] = [
  {
    src: '/landing/heute.jpg',
    alt: 'Der Tagesplan: Form, Fitness und Ermüdung, darunter die Einheiten für heute zur Wahl',
    caption: 'Jeden Morgen neu: jede deiner Sportarten als Wahl, komplett oder kurz.',
  },
  {
    src: '/landing/soll-ist.png',
    alt: 'Ein Lauf mit vier Intervallen über den Zielkorridoren, je Intervall die gehaltene Prozentzahl',
    caption: 'Danach: Intervall für Intervall, ob du im Ziel warst.',
  },
  {
    src: '/landing/verlauf.jpg',
    alt: 'Der Verlauf: Fitnesskurve, Saisonphasen und Wochenlast',
    caption: 'Und über Wochen: ob du vorankommst.',
  },
]

const STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Anmelden',
    body: 'Ein Klick über intervals.icu. Kein neues Passwort, keine API-Schlüssel zum Kopieren.',
  },
  {
    title: 'Einrichten',
    body: 'Sportarten wählen, dazu wie oft und wie lange du realistisch trainierst. Ein Ziel ist optional: Wettkampf, FTP oder einfach fit bleiben.',
  },
  {
    title: 'Loslegen',
    body: 'Jeden Morgen stehen die nächsten drei Tage bereit. Einheit wählen, per Klick auf Uhr, Radcomputer oder Rolle.',
  },
]

/** The sentence for each `?fehler=` the worker or a view sends back to the start page. */
const ERRORS: Readonly<Record<string, string>> = {
  abgelehnt: 'Zugriff wurde abgelehnt. Ohne Freigabe kann der Plan deine Daten nicht lesen.',
  einwilligung: 'Ohne Einwilligung in die Verarbeitung deiner Gesundheitsdaten ist keine Anmeldung möglich.',
  abgelaufen: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.',
}

export const landingError = (code: string): string =>
  ERRORS[code] ?? 'Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.'

const Waitlist = () => {
  const [email, setEmail] = useState('')
  // Hidden from people, filled by bots; the server answers it like a success and sends nothing.
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setState('busy')
    setError(null)
    try {
      await joinWaitlist(email, website)
      setState('sent')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.')
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <p className="waitlist__done" role="status">
        <strong>Fast geschafft.</strong> Wir haben dir eine Mail geschickt — erst mit dem Klick
        darin stehst du auf der Liste.
      </p>
    )
  }

  return (
    <form className="waitlist" onSubmit={(event) => void submit(event)}>
      <label className="waitlist__field">
        <span>Sag mir Bescheid, wenn Formkurve offen ist</span>
        <div className="waitlist__row">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="deine@mail.de"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className="cta cta--button" disabled={state === 'busy'}>
            {state === 'busy' ? 'Sende…' : 'Eintragen'}
          </button>
        </div>
      </label>
      <label className="waitlist__trap" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <p className="landing__hint">
        Eine Mail zum Start, sonst nichts. Du bestätigst per Link, abmelden geht jederzeit. Mehr in
        der <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>
    </form>
  )
}

const SignUp = ({ error }: { readonly error: string | null }) => {
  const [consented, setConsented] = useState(false)

  return (
    <>
      {error && (
        <p className="error error--block" role="alert">
          {landingError(error)}
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
      <p className="landing__hint">
        Kostenlos in der Beta. Du brauchst ein intervals.icu-Konto, fürs Rad einen Wattmesser.
      </p>
    </>
  )
}

export const Landing = ({ mode, error, confirmed = false }: Props) => (
  <div className="landing">
    <header className="landing__hero">
      <p className="landing__eyebrow">Formkurve</p>
      <h1>Wahl statt Plan: Du entscheidest spontan, der Trainingsreiz stimmt trotzdem.</h1>
      <p className="landing__lead">
        Formkurve liest deine Einheiten und Erholungswerte aus intervals.icu und schlägt jeden
        Tag eine Einheit für <em>jede</em> deiner Sportarten vor – Rad, Laufen, Schwimmen –,
        jeweils komplett und als Kurzfassung. Verpasst du einen Tag, verschiebt sich der Plan,
        statt zu brechen.
      </p>

      <ExampleDay />

      {confirmed && (
        <p className="waitlist__done" role="status">
          <strong>Bestätigt.</strong> Du stehst auf der Liste und hörst von uns, sobald Formkurve
          offen ist.
        </p>
      )}
      {mode === 'waitlist' ? !confirmed && <Waitlist /> : <SignUp error={error} />}
    </header>

    <section className="landing__section">
      <h2>So sieht es aus</h2>
      <div className="shots">
        {SHOTS.map((shot) => (
          <figure key={shot.src} className="shots__item">
            <img src={shot.src} alt={shot.alt} loading="lazy" />
            <figcaption>{shot.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>

    <section className="landing__section">
      <h2>Warum eine Einheit pro Sportart?</h2>
      <p>
        Weil Zeit der eigentliche Engpass ist. Mal passt die Rolle, mal sind die Laufschuhe
        schneller angezogen, mal bleiben nur 30 Minuten. Alle Vorschläge eines Tages setzen
        denselben Trainingsreiz – welche Sportart und welche Länge du wählst, ändert den Plan
        nicht, nur den Weg dahin. Und fällt ein Tag aus, rechnet Formkurve am nächsten Morgen
        einfach mit dem, was wirklich passiert ist.
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
        <li>Fitness, Ermüdung und Form aus all deinen Einheiten – Rad, Laufen und Schwimmen</li>
        <li>
          HRV, Ruhepuls und Schlaf im Vergleich zu deiner eigenen Baseline der letzten 30 Tage
        </li>
        <li>Mindestens 48 Stunden zwischen zwei harten Einheiten</li>
        <li>
          Periodisierung auf dein Zieldatum, wenn du eins hast, sonst in Blöcken – jede vierte
          Woche ist leichter
        </li>
        <li>Dein Zeitbudget: keine 90-Minuten-Einheit, wenn du 45 Minuten hast</li>
        <li>
          Vorgaben in Watt fürs Rad, als Pace fürs Laufen und pro 100 m fürs Schwimmen. Ohne
          Wattmesser oder Smart-Trainer lässt sich der Radplan noch nicht sinnvoll fahren.
        </li>
      </ul>
    </section>

    <section className="landing__section landing__section--muted">
      <h2>Deine Daten</h2>
      <p>
        Die Anmeldung läuft über intervals.icu. Formkurve fragt vier Berechtigungen an:
        Aktivitäten lesen, Erholungswerte lesen, geplante Einheiten in deinen Kalender schreiben
        und Einstellungen ändern. Über die Einstellungen liest Formkurve deine Schwellenwerte und
        verbundenen Geräte; ändern tut es sie nur, wenn du es anklickst. Kein Zugriff auf dein
        Passwort, und Formkurve löscht nichts. Du kannst die Freigabe jederzeit in deinen
        intervals.icu-Einstellungen widerrufen.
      </p>
      <p className="landing__legal">
        <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>
        {mode === 'waitlist' && (
          <>
            {' '}
            · <a href="/login">Anmelden</a>
          </>
        )}
      </p>
    </section>
  </div>
)
